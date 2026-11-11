/**
 * @file Helpers for extension pages (popup, options), replacing the kango UI API:
 *  - `Background.call('Module.method', ...args)` instead of kango.invokeAsync();
 *  - AngularJS module `klavotools.background` with `Background`, `Storage` and
 *    `Protocol` services and the `kgPath` directive.
 */
(function (global) {
    'use strict';

    function call(method) {
        var args = Array.prototype.slice.call(arguments, 1);
        return new Promise(function (resolve, reject) {
            chrome.runtime.sendMessage({ name: 'rpc', method: method, args: args }, function (response) {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!response) {
                    return reject(new Error('No response for ' + method));
                }
                if (response.error) {
                    return reject(new Error(response.error));
                }
                resolve(response.result);
            });
        });
    }

    function convertUrl(url) {
        return new Promise(function (resolve) {
            chrome.runtime.sendMessage({ name: 'protocol/convert', url: url }, function (response) {
                void chrome.runtime.lastError;
                resolve(response && response.url ? response.url : url);
            });
        });
    }

    var storage = {
        get: function (key, defaultValue) {
            return chrome.storage.local.get(key).then(function (items) {
                return items[key] === undefined ? defaultValue : items[key];
            });
        },
        set: function (key, value) {
            var items = {};
            items[key] = JSON.parse(JSON.stringify(value));
            return chrome.storage.local.set(items);
        },
    };

    global.Background = { call: call, convertUrl: convertUrl, storage: storage };

    if (!global.angular) {
        return;
    }

    global.angular.module('klavotools.background', [])
        .factory('Background', function ($q) {
            return {
                call: function () {
                    return $q.when(call.apply(null, arguments));
                },
            };
        })
        .factory('Storage', function ($q) {
            return {
                get: function (key, defaultValue) { return $q.when(storage.get(key, defaultValue)); },
                set: function (key, value) { return $q.when(storage.set(key, value)); },
            };
        })
        .factory('Protocol', function ($q) {
            return {
                convert: function (url) { return $q.when(convertUrl(url)); },
            };
        })
        .directive('kgPath', function (Protocol) {
            return {
                restrict: 'A',
                link: function (scope, element, attrs) {
                    Protocol.convert(attrs.href).then(function (url) {
                        element.attr('href', url);
                    });
                },
            };
        });
})(this);
