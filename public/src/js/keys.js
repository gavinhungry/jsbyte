/*
 * sandbug: An interactive web scripting sandbox
 *
 * keys.js: key-command handlers
 */

define(function(require) {
  'use strict';

  var $      = require('jquery');
  var _      = require('underscore');
  var bus    = require('bus');
  var config = require('config');
  var utils  = require('utils');

  var platform = require('platform');

  // ---

  var keys = utils.module('keys');

  var handlers = {};
  var last_hid = 0;

  var key_map = {
    'enter': 13,
    'esc':   27,
    'left':  37,
    'up':    38,
    'right': 39,
    'down':  40,
    '/':     191
  };

  var isMac = _.contains(['OS X', 'Mac OS'], platform.os.family);
  var ctrlKey = isMac ? 'metaKey' : 'ctrlKey';

  bus.init(function(av) {
    keys.console.log('init keys module');

    $(document).on('keydown', function(e) {
      // hey, I just met you ...
      var keyHandlers = _.filter(handlers, function(h) {
        return !h.paused && h.ctrl === e[ctrlKey] && h.alt === e.altKey &&
          h.shift === e.shiftKey && h.key === e.which;
      });

      // and this is crazy ...
      if (keyHandlers.length) {
        e.preventDefault();
        e.stopPropagation();
      }

      _.each(keyHandlers, function(handler) {
        // but here's my number ...
        var callback = handler ? handler.callback : null;
        // so call me maybe.
        if (_.isFunction(callback)) {
          keys.console.log('executing callback for handler', handler.hid);
          callback(e);

          return false;
        }
      });
    });
  });

  /**
   * Get a char code from a single-char
   *
   * @param {String} key - single-char or key description
   * @return {Integer | null} char code if found, null otherwise
   */
  keys.key_code_for = function(key) {
    if (!_.isString(key)) { return null; }
    if (_.has(key_map, key)) { return key_map[key]; }
    if (key.length === 1) { return key.toUpperCase().charCodeAt(0); }

    return null;
  };

  /**
   * Register a new key callback function
   *
   * @param {Object} opts - {
   *   ctrl: Boolean, alt: Boolean, shift: Boolean, key: String
   * }
   * @param {Function} callback - callback function, passed up event
   * @return {Integer} unique handler id, null if opts.key is undefined
   */
  keys.register_handler = function(opts, callback) {
    opts = opts || {};
    var hid = last_hid++;

    if (_.isUndefined(opts.key)) { return null; }
    keys.console.log('registering key handler', hid);

    handlers[hid] = {
      hid: hid,
      ctrl: !!opts.ctrl,
      alt: !!opts.alt,
      shift: !!opts.shift,
      key: keys.key_code_for(opts.key),
      callback: callback
    };

    return hid;
  };

  /**
   * Unregister a key hander by id
   *
   * @param {Integer} hid - handler id
   */
  keys.unregister_handler = function(hid) {
    if (_.has(handlers, hid)) {
      keys.console.log('unregistering key handler', hid);
      delete handlers[hid];
    }
  };

  /**
   * Pause a key hander by id
   *
   * @param {Integer} hid - handler id
   */
  keys.pause_handler = function(hid) {
    if (_.has(handlers, hid)) {
      keys.console.log('pausing key handler', hid);
      handlers[hid].paused = true;
    }
  };

  /**
   * Resume a paused a key hander by id
   *
   * @param {Integer} hid - handler id
   */
  keys.resume_handler = function(hid) {
    if (_.has(handlers, hid)) {
      keys.console.log('resuming key handler', hid);
      handlers[hid].paused = false;
    }
  };

  /**
   * Toggle a key hander by id
   *
   * @param {Integer} hid - handler id
   */
  keys.toggle_handler = function(hid) {
    if (_.has(handlers, hid)) {
      keys.console.log('toggling key handler', hid);
      handlers[hid].paused = !handlers[hid].paused;
    }
  };

  return keys;
});
