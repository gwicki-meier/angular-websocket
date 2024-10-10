(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory(require("angular")) : typeof define === "function" && define.amd ? define(["angular"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, global["angular-websocket"] = global["angular-websocket"] || {}, global["angular-websocket"].js = factory(global.angular));
})(this, function(angular) {
  "use strict";
  var noop = angular.noop;
  var objectFreeze = Object.freeze ? Object.freeze : noop;
  var objectDefineProperty = Object.defineProperty;
  var isString = angular.isString;
  var isFunction = angular.isFunction;
  var isDefined = angular.isDefined;
  var isObject = angular.isObject;
  var isArray = angular.isArray;
  var forEach = angular.forEach;
  var arraySlice = Array.prototype.slice;
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(elt) {
      var len = this.length >>> 0;
      var from = Number(arguments[1]) || 0;
      from = from < 0 ? Math.ceil(from) : Math.floor(from);
      if (from < 0) {
        from += len;
      }
      for (; from < len; from++) {
        if (from in this && this[from] === elt) {
          return from;
        }
      }
      return -1;
    };
  }
  function $WebSocketProvider($rootScope, $q, $timeout, $websocketBackend) {
    function $WebSocket(url, protocols, options) {
      if (!options && isObject(protocols) && !isArray(protocols)) {
        options = protocols;
        protocols = void 0;
      }
      this.protocols = protocols;
      this.url = url || "Missing URL";
      this.ssl = /(wss)/i.test(this.url);
      this.scope = options && options.scope || $rootScope;
      this.rootScopeFailover = options && options.rootScopeFailover && true;
      this.useApplyAsync = options && options.useApplyAsync || false;
      this.initialTimeout = options && options.initialTimeout || 500;
      this.maxTimeout = options && options.maxTimeout || 5 * 60 * 1e3;
      this.reconnectIfNotNormalClose = options && options.reconnectIfNotNormalClose || false;
      this.binaryType = options && options.binaryType || "blob";
      this._reconnectAttempts = 0;
      this.sendQueue = [];
      this.onOpenCallbacks = [];
      this.onMessageCallbacks = [];
      this.onErrorCallbacks = [];
      this.onCloseCallbacks = [];
      objectFreeze(this._readyStateConstants);
      if (url) {
        this._connect();
      } else {
        this._setInternalState(0);
      }
    }
    $WebSocket.prototype._readyStateConstants = {
      "CONNECTING": 0,
      "OPEN": 1,
      "CLOSING": 2,
      "CLOSED": 3,
      "RECONNECT_ABORTED": 4
    };
    $WebSocket.prototype._normalCloseCode = 1e3;
    $WebSocket.prototype._reconnectableStatusCodes = [
      4e3
    ];
    $WebSocket.prototype.safeDigest = function safeDigest(autoApply) {
      if (autoApply && !this.scope.$$phase) {
        this.scope.$digest();
      }
    };
    $WebSocket.prototype.bindToScope = function bindToScope(scope) {
      var self2 = this;
      if (scope) {
        this.scope = scope;
        if (this.rootScopeFailover) {
          this.scope.$on("$destroy", function() {
            self2.scope = $rootScope;
          });
        }
      }
      return self2;
    };
    $WebSocket.prototype._connect = function _connect(force) {
      if (force || !this.socket || this.socket.readyState !== this._readyStateConstants.OPEN) {
        this.socket = $websocketBackend.create(this.url, this.protocols);
        this.socket.onmessage = angular.bind(this, this._onMessageHandler);
        this.socket.onopen = angular.bind(this, this._onOpenHandler);
        this.socket.onerror = angular.bind(this, this._onErrorHandler);
        this.socket.onclose = angular.bind(this, this._onCloseHandler);
        this.socket.binaryType = this.binaryType;
      }
    };
    $WebSocket.prototype.fireQueue = function fireQueue() {
      while (this.sendQueue.length && this.socket.readyState === this._readyStateConstants.OPEN) {
        var data = this.sendQueue.shift();
        this.socket.send(
          isString(data.message) || this.binaryType != "blob" ? data.message : JSON.stringify(data.message)
        );
        data.deferred.resolve();
      }
    };
    $WebSocket.prototype.notifyOpenCallbacks = function notifyOpenCallbacks(event) {
      for (var i = 0; i < this.onOpenCallbacks.length; i++) {
        this.onOpenCallbacks[i].call(this, event);
      }
    };
    $WebSocket.prototype.notifyCloseCallbacks = function notifyCloseCallbacks(event) {
      for (var i = 0; i < this.onCloseCallbacks.length; i++) {
        this.onCloseCallbacks[i].call(this, event);
      }
    };
    $WebSocket.prototype.notifyErrorCallbacks = function notifyErrorCallbacks(event) {
      for (var i = 0; i < this.onErrorCallbacks.length; i++) {
        this.onErrorCallbacks[i].call(this, event);
      }
    };
    $WebSocket.prototype.onOpen = function onOpen(cb) {
      this.onOpenCallbacks.push(cb);
      return this;
    };
    $WebSocket.prototype.onClose = function onClose(cb) {
      this.onCloseCallbacks.push(cb);
      return this;
    };
    $WebSocket.prototype.onError = function onError(cb) {
      this.onErrorCallbacks.push(cb);
      return this;
    };
    $WebSocket.prototype.onMessage = function onMessage(callback, options) {
      if (!isFunction(callback)) {
        throw new Error("Callback must be a function");
      }
      if (options && isDefined(options.filter) && !isString(options.filter) && !(options.filter instanceof RegExp)) {
        throw new Error("Pattern must be a string or regular expression");
      }
      this.onMessageCallbacks.push({
        fn: callback,
        pattern: options ? options.filter : void 0,
        autoApply: options ? options.autoApply : true
      });
      return this;
    };
    $WebSocket.prototype._onOpenHandler = function _onOpenHandler(event) {
      this._reconnectAttempts = 0;
      this.notifyOpenCallbacks(event);
      this.fireQueue();
    };
    $WebSocket.prototype._onCloseHandler = function _onCloseHandler(event) {
      var self2 = this;
      if (self2.useApplyAsync) {
        self2.scope.$applyAsync(function() {
          self2.notifyCloseCallbacks(event);
        });
      } else {
        self2.notifyCloseCallbacks(event);
        self2.safeDigest(true);
      }
      if (this.reconnectIfNotNormalClose && event.code !== this._normalCloseCode || this._reconnectableStatusCodes.indexOf(event.code) > -1) {
        this.reconnect();
      }
    };
    $WebSocket.prototype._onErrorHandler = function _onErrorHandler(event) {
      var self2 = this;
      if (self2.useApplyAsync) {
        self2.scope.$applyAsync(function() {
          self2.notifyErrorCallbacks(event);
        });
      } else {
        self2.notifyErrorCallbacks(event);
        self2.safeDigest(true);
      }
    };
    $WebSocket.prototype._onMessageHandler = function _onMessageHandler(message) {
      var pattern;
      var self2 = this;
      var currentCallback;
      for (var i = 0; i < self2.onMessageCallbacks.length; i++) {
        currentCallback = self2.onMessageCallbacks[i];
        pattern = currentCallback.pattern;
        if (pattern) {
          if (isString(pattern) && message.data === pattern) {
            applyAsyncOrDigest(currentCallback.fn, currentCallback.autoApply, message);
          } else if (pattern instanceof RegExp && pattern.exec(message.data)) {
            applyAsyncOrDigest(currentCallback.fn, currentCallback.autoApply, message);
          }
        } else {
          applyAsyncOrDigest(currentCallback.fn, currentCallback.autoApply, message);
        }
      }
      function applyAsyncOrDigest(callback, autoApply, args) {
        args = arraySlice.call(arguments, 2);
        if (self2.useApplyAsync) {
          self2.scope.$applyAsync(function() {
            callback.apply(self2, args);
          });
        } else {
          callback.apply(self2, args);
          self2.safeDigest(autoApply);
        }
      }
    };
    $WebSocket.prototype.close = function close(force) {
      if (force || !this.socket.bufferedAmount) {
        this.socket.close();
      }
      return this;
    };
    $WebSocket.prototype.send = function send(data) {
      var deferred = $q.defer();
      var self2 = this;
      var promise = cancelableify(deferred.promise);
      if (self2.readyState === self2._readyStateConstants.RECONNECT_ABORTED) {
        deferred.reject("WebSocket connection has been closed");
      } else {
        self2.sendQueue.push({
          message: data,
          deferred
        });
        self2.fireQueue();
      }
      function cancelableify(promise2) {
        promise2.cancel = cancel;
        var then = promise2.then;
        promise2.then = function() {
          var newPromise = then.apply(this, arguments);
          return cancelableify(newPromise);
        };
        return promise2;
      }
      function cancel(reason) {
        self2.sendQueue.splice(self2.sendQueue.indexOf(data), 1);
        deferred.reject(reason);
        return self2;
      }
      if ($websocketBackend.isMocked && $websocketBackend.isMocked() && $websocketBackend.isConnected(this.url)) {
        this._onMessageHandler($websocketBackend.mockSend());
      }
      return promise;
    };
    $WebSocket.prototype.reconnect = function reconnect() {
      this.close();
      var backoffDelay = this._getBackoffDelay(++this._reconnectAttempts);
      var backoffDelaySeconds = backoffDelay / 1e3;
      console.log("Reconnecting in " + backoffDelaySeconds + " seconds");
      $timeout(angular.bind(this, this._connect), backoffDelay);
      return this;
    };
    $WebSocket.prototype._getBackoffDelay = function _getBackoffDelay(attempt) {
      var R = Math.random() + 1;
      var T = this.initialTimeout;
      var F = 2;
      var N = attempt;
      var M = this.maxTimeout;
      return Math.floor(Math.min(R * T * Math.pow(F, N), M));
    };
    $WebSocket.prototype._setInternalState = function _setInternalState(state) {
      if (Math.floor(state) !== state || state < 0 || state > 4) {
        throw new Error("state must be an integer between 0 and 4, got: " + state);
      }
      if (!objectDefineProperty) {
        this.readyState = state || this.socket.readyState;
      }
      this._internalConnectionState = state;
      forEach(this.sendQueue, function(pending) {
        pending.deferred.reject("Message cancelled due to closed socket connection");
      });
    };
    if (objectDefineProperty) {
      objectDefineProperty($WebSocket.prototype, "readyState", {
        get: function() {
          return this._internalConnectionState || this.socket.readyState;
        },
        set: function() {
          throw new Error("The readyState property is read-only");
        }
      });
    }
    return function(url, protocols, options) {
      return new $WebSocket(url, protocols, options);
    };
  }
  function $WebSocketBackendProvider($log) {
    this.create = function create(url, protocols) {
      var match = /wss?:\/\//.exec(url);
      if (!match) {
        throw new Error("Invalid url provided");
      }
      if (protocols) {
        return new WebSocket(url, protocols);
      }
      return new WebSocket(url);
    };
    this.createWebSocketBackend = function createWebSocketBackend(url, protocols) {
      $log.warn("Deprecated: Please use .create(url, protocols)");
      return this.create(url, protocols);
    };
  }
  angular.module("ngWebSocket", []).factory("$websocket", ["$rootScope", "$q", "$timeout", "$websocketBackend", $WebSocketProvider]).factory("WebSocket", ["$rootScope", "$q", "$timeout", "WebsocketBackend", $WebSocketProvider]).service("$websocketBackend", ["$log", $WebSocketBackendProvider]).service("WebSocketBackend", ["$log", $WebSocketBackendProvider]);
  angular.module("angular-websocket", ["ngWebSocket"]);
  const angularWebsocket = angular.module("ngWebSocket");
  return angularWebsocket;
});
