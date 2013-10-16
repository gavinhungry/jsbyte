/*
 * debugger.io: An interactive web scripting sandbox
 *
 * cdn.js: client-side CDN cache and filter
 */

define([
  'config', 'utils', 'jquery', 'underscore',
  'backbone', 'bus', 'templates'
],
function(config, utils, $, _, Backbone, bus, templates) {
  'use strict';

  var cdn = utils.module('cdn');

  var cdnjs = '%s://cdnjs.cloudflare.com/ajax/libs/%s/%s/%s';
  var cache = null;

  /**
   * Check if client-side CDN package cache exists
   *
   * @return {Boolean} true if cache exists, false otherwise
   */
  cdn.cache_exists = function() {
    return _.isArray(cache) && cache.length > 0;
  };

  /**
   * Return a cached version of CDN packages
   *
   * @param {Boolean} update - if true, force the cache to update first
   * @return {Promise} promise to return the CDN packages {Array}
   */
  cdn.get_cache = function(update) {
    var d = $.Deferred();

    if (!update && cdn.cache_exists()) {
      d.resolve(cache);
    } else {
      cdn.update_cache().done(function(packages) {
        d.resolve(utils.ensure_array(packages));
      }).fail(function(err) {
        d.resolve(utils.ensure_array(cache));
      });
    }

    return d.promise();
  };

  /**
   * Update the CDN package cache now
   *
   * @return {Promise}
   */
  cdn.update_cache = function() {
    var d = $.Deferred();

    $.get(utils.uri('cdn')).done(function(packages) {
      cache = packages;
      d.resolve(packages);
    }).fail(function(err) {
      d.reject(err);
    });

    return d.promise();
  };

  /**
   * Init the CDN filter input
   */
  cdn.init_filter = function() {
    var filterModel = new cdn.FilterInput();
    var filterView = new cdn.FilterInputView({ model: filterModel });
  };

  /**
   * Current filter value
   */
  cdn.FilterInput = Backbone.Model.extend({
    'defaults': { value: '' }
  });

  /**
   * Input element for filtering CDN packages
   *
   * @param {cdn.FilterInput} - filter model
   */
  cdn.FilterInputView = Backbone.View.extend({
    template: 'cdn-filter',
    el: '#markup .panel-controls',

    initialize: function(options) {
      bus.on('cdn:result:select mirror:focus', this.clear, this);
      this.model.on('change:value', this.update, this);

      this.render();
    },

    events: {
      'input #cdn': 'keypress',
      'keydown #cdn': 'keypress'
    },

    keypress: function(e) {
      if (e.which === keys.key_code_for('up')) {
        bus.trigger('cdn:results:prev-active');
      } else if (e.which === keys.key_code_for('down')) {
        bus.trigger('cdn:results:next-active');
      } else if (e.which === keys.key_code_for('enter')) {
        bus.trigger('cdn:results:select-active');
      }

      this.model.set({ value: $(e.target).val() });
    },

    clear: function() {
      this.model.set({ value: '' });
      this.$cdn.val('');
    },

    update: function() {
      var that = this;
      var filter = _.trim(this.model.get('value')).toLowerCase();

      cdn.get_cache().done(function(packages) {
        // filter for the packages that match the input
        var filtered = _.filter(packages, function(pkg) {
          return !!pkg.name && !!pkg.filename && !!pkg.version &&
            _.str.include(pkg.name.toLowerCase(), filter);
        });

        // sort filtered packages by comparing them with the filter string
        var sorted = _.sortBy(filtered, function(pkg) {
          return _.levenshtein(filter, pkg.name.toLowerCase());
        });

        // limit the number of displayed results for performance
        var limited = _.first(sorted, config.cdn_results);

        that.resultsView.set_filter(filter);
        that.resultsCollection.reset(limited);
      });
    },

    render: function() {
      var that = this;

      templates.get(this.template, function(template) {
        var html = template;
        this.$el.html(html);
        this.$cdn = this.$el.find('#cdn');

        // focus the input on key command
        keys.register_handler({ ctrl: true, key: '/' }, function(e) {
          that.$cdn.select();
        });

        cdn.get_cache().done(function(packages) {
          that.$cdn.prop('disabled', false);

          that.resultsCollection = new cdn.FilterResults([]);
          that.resultsView = new cdn.FilterResultsView({
            collection: that.resultsCollection
          });
        });
      }, this);
    }
  });

  /**
   * An available CDN package
   */
  cdn.FilterResult = Backbone.Model.extend({
    defaults: {
      name: '',
      filename: '',
      version: '',
      active: false
    }
  });

  /**
   * List element representing an available CDN package
   *
   * @param {cdn.FilterResult} - model of an available package
   */
  cdn.FilterResultView = Backbone.View.extend({
    template: 'cdn-result',
    tagName: 'li',

    initialize: function(options) {
      this.render();
    },

    events: {
      'click': 'select_lib'
    },

    get_uri: function(secure) {
      var pkg = this.model.toJSON();
      var protocol = !!secure ? 'https' : 'http';
      return _.sprintf(cdnjs, protocol, pkg.name, pkg.version, pkg.filename);
    },

    select_lib: function() {
      bus.trigger('cdn:result:select', this.get_uri());
    },

    render: function() {
      templates.get(this.template, function(template) {
        var html = _.template(template, { pkg: this.model.toJSON() });
        this.$el.html(html);
      }, this);
    }
  });

  /**
   * Collection of cdn.FilterResult(s)
   */
  cdn.FilterResults = Backbone.Collection.extend({
    model: cdn.FilterResult
  });

  /**
   * List of CDN packages to add to project
   * filtered and sorted by cdn.FilterInput
   *
   * @param {cdn.FilterResults} - collection of available packages
   * @param {jQuery} $el - element to template into
   * @param {String} filter - filter used
   */
  cdn.FilterResultsView = Backbone.View.extend({
    el: '#cdn-results',

    initialize: function(options) {
      this.collection.on('reset', this.render, this);

      bus.off_ns('cdn:results');
      bus.on('cdn:results:prev-active', this.prev_active, this);
      bus.on('cdn:results:next-active', this.next_active, this);
      bus.on('cdn:results:select-active', this.select_active, this);

      bus.on('cdn:result:select mirror:focus', this.hide, this);

      this.$content = this.$el.children('.content');
      this.filter = '';
      this.render();
    },

    set_filter: function(filter) {
      this.filter = filter;
    },

    show: function() {
      this.$el.css({ 'display': 'block' });

      // adjust margins when overflowing
      var overflow = dom.is_overflowing_with_scrollbar(this.$ol);
      this.$ol.toggleClass('overflow', overflow);

      var maxHeight = Math.min(this.$ol.outerHeight() + 2, config.cdn_height);
      this.$el.css({ 'max-height': _.sprintf('%spx', maxHeight) });

      dom.scrollbar_scroll_top(this.$el);
      dom.transition_with_scrollbar(this.$el, { 'opacity': 1 });
    },

    hide: function(callback, stopFn) {
      var that = this;

      this.$el.transition({ 'opacity': 0 }, 'fast', function() {
        if (_.isFunction(stopFn) && stopFn() === true) { return; }

        this.css({ 'display': 'none' });
        _.isFunction(callback) && callback.call(that);
      });
    },

    prev_active: function() {
      var $children = this.$ol.children();
      var $active = $children.filter('.active');
      var $prev = $active.first().prev();

      if ($prev.length) {
        $active.removeClass('active');
        $prev.addClass('active');
      }

      this.scroll_active();
    },

    next_active: function() {
      var $children = this.$ol.children();
      var $active = $children.filter('.active');
      var $next = $active.first().next();

      if ($next.length) {
        $active.removeClass('active');
        $next.addClass('active');
      } else if (!$active.length) {
        $children.first().addClass('active');
      }

      this.scroll_active();
    },

    // keep the active element visible
    scroll_active: function() {
      var $active = this.$ol.children().filter('.active').first();
      if ($active.length && this.$ol.hasClass('overflow')) {
        var paddingTop = parseInt(this.$ol.css('padding-top'), 10);
        var paddingBottom = parseInt(this.$ol.css('padding-bottom'), 10);

        var contentHeight = this.$content.outerHeight();
        var contentTop = this.$content.scrollTop();
        var contentBottom = contentTop + contentHeight;

        var activeHeight = $active.outerHeight();
        var activeTop = contentTop + $active.position().top;
        var activeBottom = activeTop + activeHeight;

        var scrollTop;

        // too far down
        if (activeBottom > contentBottom) {
          scrollTop = activeBottom - contentHeight + paddingBottom;
          dom.scrollbar_scroll_top(this.$ol, scrollTop);
        }
        // too far up
        else if (activeTop < contentTop) {
          scrollTop = activeTop - paddingTop;
          dom.scrollbar_scroll_top(this.$ol, scrollTop);
        }
      }
    },

    select_active: function() {
      var activeResultView = _.find(this._rvs, function(rv) {
        return rv.$el.hasClass('active');
      });

      if (activeResultView instanceof cdn.FilterResultView) {
        activeResultView.select_lib();
      }
    },

    render: function() {
      var that = this;

      // close the results list if there is no filter
      if (!this.filter) {
        this.hide(function() { that.$content.empty(); },
        // abort if a filter exists by the time the transition completes
        function() { return !!that.filter; });

        return;
      }

      // show "no results" as appropriate
      // var $nomatch = this.$el.children('.nomatch');
      // $nomatch.toggleClass('hide', !!this.collection.models.length);

      this._rvs = [];
      this.$ol = $('<ol>');

      // populate filtered/sorted packages
      _.each(this.collection.models, function(result) {
        var rv = new cdn.FilterResultView({ model: result });
        this._rvs.push(rv);
        this.$ol.append(rv.el);
      }, this);

      this.$content.html(this.$ol);
      this.show();
    }
  });

  return cdn;
});