(function() {
  Ember.Handlebars.registerHelper('has-permission', function(permissions, options) {
    if (options.data.view.renderedName == 'application') {
      Ember.UserApp.resetAtLogin = true;
    }

    if (Ember.UserApp.user.hasPermission(permissions)) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  Ember.Handlebars.registerHelper('has-feature', function(features, options) {
    if (options.data.view.renderedName == 'application') {
      Ember.UserApp.resetAtLogin = true;
    }

    if (Ember.UserApp.user.hasFeature(features)) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  Ember.UserApp = Ember.Namespace.create({
    indexRoute: 'index',
    loginRoute: 'login',
    appId: null,
    heartbeatInterval: 20000,
    usernameIsEmail: false,
    setup: function(application, options) {
      options = options || {};
      this.indexRoute = options.indexRoute || this.indexRoute;
      this.loginRoute = options.loginRoute || this.loginRoute;
      this.appId = options.appId;
      this.heartbeatInterval = options.heartbeatInterval || this.heartbeatInterval;
      this.usernameIsEmail = options.usernameIsEmail || this.usernameIsEmail;

      UserApp.initialize({ appId: this.appId });

      var user = this.user = Ember.UserApp.User.create({});
      application.register('ember-userapp:user', user, { instantiate: false, singleton: true });
      Ember.A(['model', 'controller', 'view', 'route']).forEach(function(component) {
        application.inject(component, 'user', 'ember-userapp:user');
      });

      application.Router.map(function() {
        this.route('oauth', { path: '/oauth/callback' });
      });

      application.OauthRoute = Ember.Route.extend({
        beforeModel: function() {
          var self = this;
          var user = this.get('user');

          if (user.userPromise) {
            user.userPromise.then(function() {
              self.transitionTo(Ember.UserApp.indexRoute);
            });
          }
        }
      });
    }
  });

  Ember.UserApp.User = Ember.ObjectProxy.extend({
    authenticated: false,
    current: null,
    token: null,
    heartBeatTimer: null,
    applicationRoute: null,
    startHeartbeat: function(interval) {
      var self = this;
      this.stopHeartbeat();
      this.heartBeatTimer = setInterval(function() {
        UserApp.Token.heartbeat(function(error, result) {
          if (error) {
            self.applicationRoute && self.applicationRoute.transitionTo(Ember.UserApp.loginRoute);
            self.reset();
          }
        });
      }, interval);
    },
    stopHeartbeat: function() {
      clearInterval(this.heartBeatTimer);
    },
    load: function() {
      var self = this;
      return new Ember.RSVP.Promise(function(resolve, reject) {
        UserApp.User.get({ user_id: 'self' }, function(error, users) {
          if (!error) {
            resolve(users[0]);
          } else {
            reject(error);
          }
        });
      });
    },
    login: function(credentials) {
      var self = this;
      return new Ember.RSVP.Promise(function(resolve, reject) {
        UserApp.User.login({ login: credentials.username, password: credentials.password }, function(error, result) {
          if (!error) {
            if (result.locks && result.locks.indexOf('EMAIL_NOT_VERIFIED') > -1) {
              UserApp.setToken(null);
              reject({ name: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email address by clicking on the link in the verification email that we\'ve sent you.' });
            } else if (result.locks && result.locks.length > 0) {
              UserApp.setToken(null);
              reject({ name: 'LOCKED', message: 'Your account has been locked.' });
            } else {
              self.load().then(function(user) {
                user.token = result.token;
                resolve(user);
              }, function(error) {
                reject(error);
              });
            }
          } else {
            reject(error);
          }
        });
      });
    },
    signup: function(user) {
      var self = this;
      return new Ember.RSVP.Promise(function(resolve, reject) {
        user.login = user.username;

        if (Ember.UserApp.usernameIsEmail) {
          user.email = user.username;
        }

        UserApp.User.save(user, function(error, result) {
            if (!error) {
              if (result.locks && result.locks.length > 0 && result.locks[0].type == 'EMAIL_NOT_VERIFIED') {
                  reject({ name: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email address by clicking on the link in the verification email that we\'ve sent you.' });
              } else {
                  resolve();
              }
            } else {
              reject(error);
            }
        });
      });
    },
    logout: function() {
      return new Ember.RSVP.Promise(function(resolve, reject) {
        UserApp.User.logout(function(error, result) {
          if (!error) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
    },
    hasPermission: function(permissions) {
      if (!this.current || !this.current.permissions || !permissions) {
        return false;
      }

      if (typeof(permissions) != 'object') {
        permissions = permissions.split(' ');
      }

      for (var i = 0; i < permissions.length; ++i) {
        if (!(this.current.permissions[permissions[i]] && this.current.permissions[permissions[i]].value === true)) {
          return false;
        }
      }

      return true;
    },
    hasFeature: function(features) {
      if (!this.current || !this.current.features || !features) {
        return false;
      }

      if (typeof(features) != 'object') {
        features = features.split(' ');
      }

      for (var i = 0; i < features.length; ++i) {
        if (!(this.current.features[features[i]] && this.current.features[features[i]].value === true)) {
          return false;
        }
      }

      return true;
    },
    setup: function(user, route) {
      UserApp.setToken(user.token);
      this.startHeartbeat(Ember.UserApp.heartbeatInterval);
      Cookies.set('ua_session_token', user.token, { expires: new Date(new Date().getTime() + 31536000000) });
      this.setProperties({
        authenticated: true,
        current: user,
        applicationRoute: route
      });
    },
    reset: function() {
      this.stopHeartbeat();
      UserApp.setToken(null);
      Cookies.expire('ua_session_token');
      this.setProperties({
        authenticated: false,
        current: null,
        applicationRoute: null
      });
    }
  });

  Ember.UserApp.ApplicationRouteMixin = Ember.Mixin.create({
    beforeModel: function(transition) {
      var self = this;
      var token = Cookies.get('ua_session_token');
      var user = this.get('user');

      if (window.location.hash) {
        var matches = window.location.hash.match(/ua_token=([a-z0-9_\-]+)/i);
        if (matches && matches.length == 2) {
          token = matches[1];
        }
      }

      if (token) {
        user.setup({ token: token }, self);
        user.userPromise = new Ember.RSVP.Promise(function(resolve, reject) {
          user.load().then(function(usr) {
            usr.token = token;
            user.set('current', usr);
            resolve();
          }, function(error) {
            resolve();
          });
        });
      } else {
        user.userPromise = null;
      }
    },
    model: function() {
      return this.get('user').userPromise;
    },
    actions: {
      loginSucceeded: function(user) {
        this.get('user').setup(user, this);
        this.transitionTo(Ember.UserApp.indexRoute).then(function() {
          if (Ember.UserApp.resetAtLogin) {
            App.reset();
          }
        });
      },
      signupSucceeded: function(user) {
        var self = this;
        this.get('user').login(user).then(function(currentUser) {
          self.send('loginSucceeded', currentUser);
        }, function(error) {
          self.set('error', error);
        });
      },
      logout: function() {
        var self = this;
        this.get('user').logout().then(function() {
          self.send('logoutSucceeded');
        }, function(error) {
          self.send('logoutSucceeded');
        });
      },
      logoutSucceeded: function() {
        var self = this;
        this.transitionTo(Ember.UserApp.loginRoute).then(function() {
          self.get('user').reset();

          if (Ember.UserApp.resetAtLogin) {
            App.reset();
          }
        });
      }
    }
  });

  Ember.UserApp.ProtectedRouteMixin = Ember.Mixin.create({
    beforeModel: function(transition) {
      if (!this.get('user.authenticated')) {
        transition.abort();
        this.transitionTo(Ember.UserApp.loginRoute);
      }
    }
  });

  Ember.UserApp.FormControllerMixin = Ember.Mixin.create({
    actions: {
      login: function() {
        var self = this;
        var credentials = this.getProperties('username', 'password');

        if (self.get('loading') == true) {
          return;
        }

        self.set('error', null);
        self.get('user').reset();

        if (!Ember.isEmpty(credentials.username) && !Ember.isEmpty(credentials.password)) {
          self.set('loading', true);
          self.set('password', null);
          self.get('user').login(credentials).then(function(user) {
            self.send('loginSucceeded', user);
            self.set('loading', false);
          }, function(error) {
            self.set('error', error);
            self.set('loading', false);
          });
        }
      },
      signup: function() {
        var self = this;
        var user = {};

        if (self.get('loading') == true) {
          return;
        }

        self.set('error', null);
        self.get('user').reset();

        for (var k in this) {
          if (typeof(this[k]) == 'string' && k.indexOf('_') != 0) {
            user[k] = this[k];
          }
        }

        if (!Ember.isEmpty(user.username) && !Ember.isEmpty(user.password)) {
          self.set('loading', true);
          self.set('password', null);
          self.get('user').signup(user).then(function() {
            self.send('signupSucceeded', user);
            self.set('loading', false);
          }, function(error) {
            self.set('error', error);
            self.set('loading', false);
          });
        }
      },
      oauth: function(providerId, scopes, redirectUri) {
        var self = this;
        
        if (!providerId) {
          return;
        }

        if (self.get('loading') == true) {
          return;
        }

        var scopes = scopes ? scopes.split(',') : null;
        var defaultRedirectUrl = window.location.protocol+'//'+window.location.host+window.location.pathname+'#/oauth/callback/';
        var redirectUri = redirectUri || defaultRedirectUrl;

        self.set('loading', true);

        UserApp.OAuth.getAuthorizationUrl({ provider_id: providerId, redirect_uri: redirectUri, scopes: scopes }, function(error, result) {
            if (error) {
              self.set('error', error);
              self.set('loading', false);
            } else {
               window.location.href = result.authorization_url;
            }
        });
      }
    }
  });

  /*! Cookies.js - 0.3.1; Copyright (c) 2013, Scott Hamper; http://www.opensource.org/licenses/MIT */
  (function(e){"use strict";var a=function(b,d,c){return 1===arguments.length?a.get(b):a.set(b,d,c)};a._document=document;a._navigator=navigator;a.defaults={path:"/"};a.get=function(b){a._cachedDocumentCookie!==a._document.cookie&&a._renewCache();return a._cache[b]};a.set=function(b,d,c){c=a._getExtendedOptions(c);c.expires=a._getExpiresDate(d===e?-1:c.expires);a._document.cookie=a._generateCookieString(b,d,c);return a};a.expire=function(b,d){return a.set(b,e,d)};a._getExtendedOptions=function(b){return{path:b&& b.path||a.defaults.path,domain:b&&b.domain||a.defaults.domain,expires:b&&b.expires||a.defaults.expires,secure:b&&b.secure!==e?b.secure:a.defaults.secure}};a._isValidDate=function(b){return"[object Date]"===Object.prototype.toString.call(b)&&!isNaN(b.getTime())};a._getExpiresDate=function(b,d){d=d||new Date;switch(typeof b){case "number":b=new Date(d.getTime()+1E3*b);break;case "string":b=new Date(b)}if(b&&!a._isValidDate(b))throw Error("`expires` parameter cannot be converted to a valid Date instance"); return b};a._generateCookieString=function(b,a,c){b=encodeURIComponent(b);a=(a+"").replace(/[^!#$&-+\--:<-\[\]-~]/g,encodeURIComponent);c=c||{};b=b+"="+a+(c.path?";path="+c.path:"");b+=c.domain?";domain="+c.domain:"";b+=c.expires?";expires="+c.expires.toUTCString():"";return b+=c.secure?";secure":""};a._getCookieObjectFromString=function(b){var d={};b=b?b.split("; "):[];for(var c=0;c<b.length;c++){var f=a._getKeyValuePairFromCookieString(b[c]);d[f.key]===e&&(d[f.key]=f.value)}return d};a._getKeyValuePairFromCookieString= function(b){var a=b.indexOf("="),a=0>a?b.length:a;return{key:decodeURIComponent(b.substr(0,a)),value:decodeURIComponent(b.substr(a+1))}};a._renewCache=function(){a._cache=a._getCookieObjectFromString(a._document.cookie);a._cachedDocumentCookie=a._document.cookie};a._areEnabled=function(){var b="1"===a.set("cookies.js",1).get("cookies.js");a.expire("cookies.js");return b};a.enabled=a._areEnabled();"function"===typeof define&&define.amd?define(function(){return a}):"undefined"!==typeof exports?("undefined"!== typeof module&&module.exports&&(exports=module.exports=a),exports.Cookies=a):window.Cookies=a})();
})();