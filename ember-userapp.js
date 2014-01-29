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
    loginRoute: 'login',
    indexRoute: 'index',
    setup: function(application, options) {
      options = options || {};
      this.indexRoute = options.indexRoute || this.indexRoute;
      this.loginRoute = options.loginRoute || this.loginRoute;
      this.appId = options.appId;
      this.heartBeatInterval = options.heartBeatInterval || 20000;

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
            self.load().then(function(user) {
              user.token = result.token;
              resolve(user);
            }, function(error) {
              reject(error);
            });
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
        UserApp.User.save(user, function(error, result) {
            if (!error) {
              resolve();
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
      this.startHeartbeat(Ember.UserApp.heartBeatInterval);
      Kaka.set('ua_session_token', user.token);
      this.setProperties({
        authenticated: true,
        current: user,
        applicationRoute: route
      });
    },
    reset: function() {
      this.stopHeartbeat();
      UserApp.setToken(null);
      Kaka.remove('ua_session_token');
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
      var token = Kaka.get('ua_session_token');
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
        self.set('error', null);
        self.get('user').reset();

        if (!Ember.isEmpty(credentials.username) && !Ember.isEmpty(credentials.password)) {
          this.set('password', null);
          this.get('user').login(credentials).then(function(user) {
            self.send('loginSucceeded', user);
          }, function(error) {
            self.set('error', error);
          });
        }
      },
      signup: function() {
        var self = this;
        var user = {};
        self.set('error', null);
        self.get('user').reset();

        for (var k in this) {
          if (typeof(this[k]) == 'string' && k.indexOf('_') != 0) {
            user[k] = this[k];
          }
        }

        if (!Ember.isEmpty(user.username) && !Ember.isEmpty(user.password)) {
          this.set('password', null);
          this.get('user').signup(user).then(function() {
            self.send('signupSucceeded', user);
          }, function(error) {
            self.set('error', error);
          });
        }
      },
      oauth: function(providerId, scopes, redirectUri) {
        if (!providerId) {
          return;
        }

        var scopes = scopes ? scopes.split(',') : null;
        var defaultRedirectUrl = window.location.protocol+'//'+window.location.host+window.location.pathname+'#/oauth/callback/';
        var redirectUri = redirectUri || defaultRedirectUrl;

        UserApp.OAuth.getAuthorizationUrl({ provider_id: providerId, redirect_uri: redirectUri, scopes: scopes }, function(error, result) {
            if (error) {
                self.set('error', error);
            } else {
                window.location.href = result.authorization_url;
            }
        });
      }
    }
  });


  // Kaka - The Embeddable Cookie Library
  // Kaka was created for a purpose, and one purpose only. To add simple cookie support for libraries that need it!
  // It does this with a simple unrestricted license. So change the code, the name (please!), and use it however you like!!
  // https://github.com/comfirm/Kaka.js
  var Kaka = window.Kaka = {};

  Kaka.get = function(name){
          var cookies = {};
          var decodeComponent = decodeURIComponent;
          var data = (document.cookie || "").split("; ");

          for(var i=0;i<data.length;++i){
                  var segments = data[i].split("=", 2);
                  if(segments.length == 2){
                      if (!cookies[decodeComponent(segments[0])]) {
                          cookies[decodeComponent(segments[0])] = decodeComponent(segments[1]);
                      }
                  }
          }

          return (name === undefined ? cookies : (name in cookies ? cookies[name] : null));
  };

  Kaka.set = function(name, value, expires, path){
          var variables = {};
          var encodeComponent = encodeURIComponent;

          variables[name] = value == undefined || value == null ? '' : value;
          variables['path'] = path || '/';

          if(expires && expires.toGMTString){
                  variables["expires"] = expires.toGMTString();
          }

          var cookie = "";

          for(var key in variables){
                  cookie += (cookie != "" ? "; " : "") + encodeComponent(key) + "=" + encodeComponent(variables[key]);
          }

          document.cookie = cookie;
  };

  Kaka.remove = function(name){
          Kaka.set(name, null, new Date(0));
  };
})();