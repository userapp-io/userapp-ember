UserApp Ember.js
=================

Ember.js module that adds user authentication to your app with [UserApp](https://www.userapp.io/). It supports protected/public routes, rerouting on login/logout, heartbeats for status checks, stores the session token in a cookie, components for signup/login/logout, OAuth, etc.

*UserApp is a cloud-based user management API for web apps with the purpose to relieve developers from having to program logic for user authentication, sign-up, invoicing, feature/property/permission management, and more.*

## Getting Started

**Include the [UserApp JavaScript library](https://app.userapp.io/#/docs/libs/javascript/) and this Ember module in your *index.html*:**

        <script src="https://app.userapp.io/js/userapp.client.js"></script>
        <script src="https://rawgithub.com/userapp-io/userapp-ember/master/ember-userapp.js"></script>

Be sure to add them before your *app.js* file.

(You can also install the module with bower: `$ bower install userapp-ember`)

**Initiate the module in *app.js* with your [App Id](https://help.userapp.io/customer/portal/articles/1322336-how-do-i-find-my-app-id-):**

        Ember.Application.initializer({
		  name: 'userapp',
		  initialize: function(container, application) {
		    Ember.UserApp.setup(application, { appId: 'YOUR-APP-ID' });
		  }
		});

**Create routes for login and signup**

        App.Router.map(function() {
		 	this.route('login');
			this.route('signup');
		});

**Create the login and signup templates:**

Use the action `login` and `signup` to attach to the forms to the UserApp API.

The login form requires two properties, `username` and `password` to be bound to the model.

	<script type="text/x-handlebars" data-template-name="login">
		<form {{action login on='submit'}}>
		    <label for="username">Username</label>
		    {{input id='username' placeholder='Enter Username' class='form-control' value=username}}
		    <label for="password">Password</label>
		    {{input id='password' placeholder='Enter Password' class='form-control' type='password' value=password}}
		  	<button type="submit" class="btn btn-default">Login</button>
		</form>
		{{#if error}}
		  <div class="alert alert-error">{{error.message}}</div>
		{{/if}}
	</script>

The signup form requires a `username` and `password`. All input field names must reflect the user's properties (except for username).

	<script type="text/x-handlebars" data-template-name="signup">
		<form {{action signup on='submit'}}>
		    <label for="username">Username</label>
		    {{input id='username' placeholder='Enter a Username' class='form-control' value=username}}
		    <label for="email">Email</label>
		    {{input id='email' placeholder='Enter your Email' class='form-control' value=email}}
		    <label for="password">Password</label>
		    {{input id='password' placeholder='Enter a Password' class='form-control' type='password' value=password}}
		  	<button type="submit" class="btn btn-default">Sign up</button>
		</form>
		{{#if error}}
		  <div class="alert alert-error">{{error.message}}</div>
		{{/if}}
	</script>

When an error occurs the `error` object will contain more information about the error.

**Set up your routes. The application route should extend `Ember.UserApp.ApplicationRouteMixin`. Login and signup routes should extend `Ember.UserApp.FormControllerMixin`. And all protected routes should extend `Ember.UserApp.ProtectedRouteMixin`:**

		App.ApplicationRoute = Ember.Route.extend(Ember.UserApp.ApplicationRouteMixin);
		App.SignupController = Ember.Controller.extend(Ember.UserApp.FormControllerMixin);
		App.LoginController = Ember.Controller.extend(Ember.UserApp.FormControllerMixin);
		App.IndexRoute = Ember.Route.extend(Ember.UserApp.ProtectedRouteMixin);

**Add a log out link:**
    
        <a href="#" {{ action 'logout' }}>Log out</a>

(Ends the session and redirects to the login route)

**Hide/show elements that should only be visible when logged in:**
  		
  		{{#if user.authenticated}}
        	<a href="#" {{ action 'logout' }}>Log out</a>
        {{/if}}

**Use the `user.current` property to access properties on the logged in user:**

        <div>Welcome {{user.current.first_name}}!</div>

**To let your users sign up with their social accounts, use the `oauth` action:

		<a href="#" {{ action 'oauth' 'google' }}>Log in with Google</a>

First you need to activate the providers in UserApp, read more about it here: <https://app.userapp.io/#/docs/concepts/#social-login>

## Example

See [example/](https://github.com/userapp-io/userapp-ember/tree/master/example) for a demo app based on the Ember Starter Kit and Bootstrap.

## Help

Contact us via email at support@userapp.io or visit our [support center](https://help.userapp.io).

## License

MIT, see LICENSE.