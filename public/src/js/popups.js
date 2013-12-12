/*
 * debugger.io: An interactive web scripting sandbox
 *
 * popup.js: template-able popup windows
 */

define([
  'config', 'utils', 'jquery', 'underscore',
  'bus', 'templates'
],
function(config, utils, $, _, bus, templates) {
  'use strict';

  var popups = utils.module('popups');
  var popupEl = '#popup';

  /**
   *
   */
  popups.Popup = Backbone.Model.extend({
    defaults: { title: 'Popup' }
  });

  /**
   *
   */
  popups.PopupView = Backbone.View.extend({
    el: popupEl,

    initialize: function(options) {
      this.render();
    },

    events: {
      'click': function(e) {
        // only destroy the popup if the background area is clicked
        if ($(e.target).is(popupEl)) { this.destroy(); }
      }
    },

    destroy: function() {
      var that = this;

      popups.hide().always(function() {
        // View.remove would call $el.remove, we want to reuse it
        that.$el.empty();
        that.stopListening();
        that.undelegateEvents();
        // FIXME: need to navigate away now?
      });
    },

    render: function() {
      var popup_p = templates.get('popup', this);
      var content_p = templates.get(this.template, this);
      var template_fns = $.when(popup_p, content_p);

      template_fns.done(function(popup_fn, content_fn) {
        var that = _.first(utils.ensure_array(this));

        var data = that.model.toJSON();

        var contentHtml = content_fn({ data: data });
        var popupHtml = popup_fn({
          title: data.title,
          content: contentHtml
        });

        // remove any existing popups first
        popups.hide().done(function() {
          that.$el.html(popupHtml);
          popups.show();
        });

      }).fail(function(err) {
        var that = _.first(utils.ensure_array(this));
        var msg = _.sprintf('Error rendering "%s" - %s', that.template, err);
        console.error(msg);
      });

      return this;
    }
  });

  /**
   *
   */
  popups.LoginPopup = popups.Popup.extend({
    defaults: { title: 'Login' }
  });

  /**
   *
   */
  popups.LoginPopupView = popups.PopupView.extend({
    template: 'popup-login',

    initialize: function(options) {
      this.events = _.extend({}, this.events, this._events);
      this.constructor.__super__.initialize.apply(this, arguments);
    },

    _events: {
      'submit #login_form': function(e) {
        var that = this;
        e.preventDefault();

        var $form = $(e.target);
        var uri = _.sprintf('%s?%s', $form.attr('action'), $form.serialize());
        var method = $form.attr('method') === 'post' ? 'post' : 'get';

        $[method](uri).done(function(username) {

          // welcome! do something.

          that.destroy();
        }).fail(function() {
          that.show_invalid_login();
        });
      }
    },

    show_invalid_login: function() {

    }
  });

  /**
   * Build a popup and show it right away
   *
   * @param {String} name - name of the popup template to use
   */
  popups.build = function(name) {
    var modelName = _.sprintf('%sPopup', _.capitalize(_.camelize(name)));
    var viewName = _.sprintf('%sView', modelName);

    var modelConstructor = popups[modelName];
    var viewConstructor = popups[viewName];

    if (!modelConstructor || !viewConstructor) {
      console.error('popups.%s / popups.%s do not exist', modelName, viewName);
      return;
    }

    var model = new modelConstructor();
    var view = new viewConstructor({ model: model });
  };

  /**
   * Show the currently assigned popup
   *
   * @return {Promise} resolves to true after showing, or rejects to false
   */
  popups.show = function() {
    var d = $.Deferred();

    var $popup = $(popupEl);
    if (!$popup.length || $popup.is(':empty')) { d.reject(false); }
    else {
      $popup.show().transition({ 'opacity': 1 }, function() {
        d.resolve(true);
      });
    }

    return d.promise();
  };

  /**
   * Hide the currently visible popup
   *
   * @return {Promise} resolves to true after hiding, or rejects to false
   */
  popups.hide = function() {
    var d = $.Deferred();

    var $popup = $(popupEl);
    if (!$popup.length) { d.reject(false); }
    else {
      $popup.transition({ 'opacity': 0 }, function() {
        $popup.hide();
        d.resolve(true);
      });
    }

    return d.promise();
  };

  return popups;
});