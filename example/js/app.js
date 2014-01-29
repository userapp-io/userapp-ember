Ember.Application.initializer({
  name: 'userapp',
  initialize: function(container, application) {
  	Ember.UserApp.setup(application, { appId: '52b8a5d2dca15' });
  }
});

App = Ember.Application.create();

App.Router.map(function() {
  this.route('signup');
  this.route('login');
  this.route('articles');
  this.route('photos');
});

App.ApplicationRoute = Ember.Route.extend(Ember.UserApp.ApplicationRouteMixin);

App.SignupController = Ember.Controller.extend(Ember.UserApp.FormControllerMixin);
App.LoginController = Ember.Controller.extend(Ember.UserApp.FormControllerMixin);

App.IndexRoute = Ember.Route.extend(Ember.UserApp.ProtectedRouteMixin);
App.ArticlesRoute = Ember.Route.extend(Ember.UserApp.ProtectedRouteMixin);
App.PhotosRoute = Ember.Route.extend(Ember.UserApp.ProtectedRouteMixin);