/*
 * sandbug: An interactive web scripting sandbox
 */

define(function(require) {
  'use strict';

  var _      = require('underscore');
  var config = require('config');
  var utils  = require('utils');

  var auth    = require('auth');
  var bugs    = require('bugs');
  var cons    = require('consolidate');
  var express = require('express');
  var mobile  = require('connect-mobile-detection');

  var module    = require('module');
  var path      = require('path');
  var __dirname = path.dirname(module.uri);

  // ---

  var app = {};

  var LOCALES_PATH = './public/locales';

  // Express server
  var server = express();
  app.port = config.server.port;

  auth.init(server);

  app.init = function() {
    server.listen(app.port);
  };

  var _bugAccessDenied = function(err, bug, req, enforcePrivate) {
    var user = req.user || {};

    // the bug is private and
    return !err && bug &&
      (!enforcePrivate || bug.private) &&
      // the bug has no recorded origin, or origin tokens do not match and
      (!bug.origin || (auth.sha512(req.session.csrfSecret) !== bug.origin)) &&
      // theres no username or
      (!user.username ||
        // there is a username, but not a match
        (user.username !== bug.username &&
          _.contains(bug.collaborators, user.username)));
  };

  var userCanReadBug = function(req, res, next) {
    bugs.crud.read(req.params.slug, function(err, bug) {
      if (!bug) {
        return res.status(404).end();
      }

      if (_bugAccessDenied(err, bug, req, true)) {
        return res.status(403).end();
      }

      next();
    });
  };

  var userCanWriteBug = function(req, res, next) {
    bugs.crud.read(req.params.slug, function(err, bug) {
      if (!bug) {
        return res.status(404).end();
      }

      if (_bugAccessDenied(err, bug, req)) {
        return res.status(403).end();
      }

      next();
    });
  };

  var routes = {
    post: { // CREATE
      signup: function(req, res) {
        var username = req.body.username;
        var email    = req.body.email;
        var password = req.body.password;
        var confirm  = req.body.confirm;

        auth.create_user(username, email, password, confirm).then(function(user) {
          auth.authenticate(req, res, function(err) {
            if (err) { utils.server_error(res, err); }
            else { res.json(user.username); }
          });
        }, utils.server_error_handler(res)).done();
      },

      login: function(req, res) {
        var user = req.user || {};
        var username = auth.sanitize_username(user.username);
        res.json(username);
      },

      logout: function(req, res) {
        req.logout();
        res.end();
      },

      bug: function(req, res) {
        var user = req.user || {};

        var bug = req.body;
        bug.username = bug.updater = user.username || null;
        bug.origin = auth.sha512(req.session.csrfSecret);

        bug.created = new Date();
        bug.updated = bug.created;

        if (bug.username) {
          bug.origin = null;
        }

        bugs.crud.create(bug, bugs.crud.rest(res, function(bug) {
          delete bug.origin;
        }));
      }
    },

    get: { // READ
      index: function(req, res) {
        var user = req.user || {};

        res.render('index', {
          prod: config.prod,
          rev: config.build.rev,
          username: auth.sanitize_username(user.username),
          csrf: req.csrfToken(),
          mode: { mobile: !!req.mobile, phone: !!req.phone, tablet: !!req.tablet },
          themes: config.themes
        });
      },

      config: function(req, res) {
        res.json(config.client);
      },

      locales: function(req, res) {
        utils.dir_json(LOCALES_PATH, 'locale').then(function(locales) {
          res.json(locales);
        }, utils.server_error_handler(res)).done();
      },

      bug: function(req, res) {
        bugs.crud.read(req.params.slug, bugs.crud.rest(res, function(bug) {
          delete bug.origin;
        }));
      },

      user: function(req, res) {
        var user = req.user || {};
        var username = user.username;

        auth.crud.read(username, auth.crud.rest(res));
      }
    },

    put: { // UPDATE
      bug: function(req, res) {
        var user = req.user || {};

        var bug = req.body;
        bug.username = bug.username || user.username || null;
        bug.origin = bug.username ? null : auth.sha512(req.session.csrfSecret);

        delete bug.created;
        bug.updated = new Date();
        bug.updater = user.username;

        bugs.crud.update(req.params.slug, bug, bugs.crud.rest(res, function(bug) {
          delete bug.origin;
        }));
      },

      user: function(req, res) {
        var user = req.user || {};
        var username = user.username;
        var p = req.body.password || {};

        var updateSettings = function() {
          auth.crud.update(username, {
            settings: req.body.settings
          }, auth.crud.rest(res));
        };

        if (!p || !p.password) {
          return updateSettings();
        }

        auth.change_password(username, p.current, p.password, p.confirm).then(updateSettings,
          utils.server_error_handler(res)).done();
      }
    },

    delete: { // DELETE
      bug: function(req, res) {
        bugs.crud.delete(req.params.slug, bugs.crud.rest(res));
      }
    }
  };

  // connect-mobile-detection
  server.use(mobile());

  // use Underscore/Lodash templates
  server.engine('html', cons.underscore);
  server.set('view engine', 'html');
  server.set('views', __dirname + '/templates');

  // routes
  server.get('/', routes.get.index);
  server.get('/api/config', routes.get.config);
  server.get('/api/resource/locales', routes.get.locales);

  server.post('/api/signup', routes.post.signup);
  server.post('/api/login', auth.authenticate, routes.post.login);
  server.post('/api/logout', routes.post.logout);

  server.post('/api/bugs', routes.post.bug);
  server.get('/api/bug/:slug', userCanReadBug, routes.get.bug);
  server.put('/api/bug/:slug', userCanWriteBug, routes.put.bug);
  server.delete('/api/bug/:slug', userCanWriteBug, routes.delete.bug);

  server.get('/api/bug/:slug/writable', userCanWriteBug, function(req, res) {
    res.end();
  });

  server.get('/api/user', routes.get.user);
  server.put('/api/user', routes.put.user);

  server.get('/api/*', function(req, res) {
    res.status(404).end();
  });

  server.get('/bug/:slug', routes.get.index);

  server.use(function(req, res) {
    res.redirect('/');
  });

  return app;
});
