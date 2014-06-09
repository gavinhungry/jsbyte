/*
 * debugger.io: An interactive web scripting sandbox
 *
 * bugs.js: bug actions
 */

define([
  'config', 'utils', 'jquery', 'underscore',
  'backbone', 'flash', 'frame', 'mirrors', 'popups'
],
function(
  config, utils, $, _, Backbone, flash, frame, mirrors, popups
) {
  'use strict';

  var bugs = utils.module('bugs');

  bus.init(function(av) {
    var _model = new bugs.Bug();
    var _view = new bugs.BugView({ model: _model });

    bugs._priv.current = {
      model: _model,
      view: _view
    };

    _.each(mirrors.get_all(), function(mirror) {

      var update_map = function() {
        bugs._priv.current.model.set('map', mirrors.get_map(true));
      };

      bus.on(_.sprintf('mirrors:%s:mode', mirror.panel), update_map);
      mirror.cm.on('change', update_map);
    });
  });

  /**
   *
   */
  bugs.Bug = Backbone.Model.extend({
    idAttribute: 'slug',

    _url: '/api/bugs/',
    url: function() {
      return this._url + this.get(this.idAttribute);
    }
  });

  /**
   *
   */
  bugs.BugView = Backbone.View.extend({
    render: function() {
      var props = this.model.toJSON();

      _.each(props.map, function(value, key) {
        mirrors.set_mode(key, value.mode);
        mirrors.set_content(key, value.content);
      });

      if (props.autorun) { _.defer(frame.update); }

      return this;
    }
  });

  /**
   * Display a Bug
   *
   * @param {bugs.Bug} bug
   */
  bugs.display = function(bug) {
    var props = bug.toJSON();

    bus.trigger('navigate', 'bugs/' + props.slug);

    // destroy previous model
    if (bugs._priv.current.model instanceof bugs.Bug) {
      bugs._priv.current.model.destroy();
    }

    var view = new bugs.BugView({ model: bug });

    bugs._priv.current = {
      model: bug,
      view: view
    };

    view.render();
  };

  /**
   * Get a bug from the server matching a slug
   *
   * @param {String} bugslug - slug id for a bug
   * @return {Promise} resolving to {bugs.Bug}
   */
  bugs.get = function(bugslug) {
    var bug = new bugs.Bug({ slug: bugslug });
    return bug.fetch().then(function() {
      return bug;
    }, flash.xhr_error);
  };

  /**
   * Get a bug from the server and display it
   *
   * @param {String} bugslug - slug id for a bug
   * @return {Promise}
   */
  bugs.open = function(bugslug) {
    return bugs.get(bugslug).then(bugs.display);
  };

  /**
   * Save the currently displayed bug
   *
   * @return {Promise}
   */
  bugs.save = function() {
    return popups.popup('input', 'bug_name_pick', [
      { name: 'title', placeholder: 'bug_title', copy_to: 'slug' },
      { name: 'slug', placeholder: 'url_slug', filter: _.slugify }
    ]).done(function(result) {

      console.log(result);

      // save bugs._priv.current here (with new slug? need a "Save As"?)
    });
  };

  /**
   * Create a new bug
   */
  bugs.create = function() {




  };

  return bugs;
});
