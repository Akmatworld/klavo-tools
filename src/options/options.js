angular.module('klavotools', [
    'klavotools.joke',
    'klavotools.background'])

.directive('negate', [function () {
    return {
        require: 'ngModel',
        link: function (scope, element, attribute, ngModelController) {
            ngModelController.$isEmpty = function(value) {
                return !!value;
            };

            ngModelController.$formatters.unshift(function (value) {
                return !value;
            });

            ngModelController.$parsers.unshift(function (value) {
                return !value;
            });
        }
    };
}])
.directive('convertToNumber', function() {
    return {
        require: 'ngModel',
        link: function(scope, element, attrs, ngModel) {
            ngModel.$parsers.push(function(val) {
                return parseInt(val, 10);
            });
            ngModel.$formatters.push(function(val) {
                return val + '';
            });
        }
    };
})
.directive('ktsVersion', function() {
    return {
        restrict: 'E',
        link: function(scope, element, attrs) {
            element.text(chrome.runtime.getManifest().version);
        }
    }
})
.factory('settings', function (Background) {
    return {
        get: function (backgroundGetter) {
            return Background.call(backgroundGetter)
            .then(function(data) {
                var settings = {};
                for (var key in data) {
                    settings[key] = {
                        name: key,
                        type: typeof data[key],
                        value: data[key],
                    };
                }
                return settings;
            });
        },

        set: function (backgroundSetter, newSettings, oldSettings) {
            if (!Object.keys(newSettings).length
             || !Object.keys(oldSettings).length) {
                return false;
            }

            var changed = {};
            for (var key in newSettings)
                if (!angular.equals(newSettings[key].value, oldSettings[key].value))
                    changed[key] = newSettings[key].value;

            if (Object.keys(changed).length)
                Background.call(backgroundSetter, changed);
        }
    }
})
.controller('GlobalSettings', function($scope, settings) {
    $scope.settings = [];
    settings.get('Settings.get').then(function (data) {
        $scope.settings = data;
    });
    $scope.$watch('settings', function(newSettings, oldSettings) {
        settings.set('Settings.set', newSettings, oldSettings);
    }, true);
})
.controller('RaceInvitations', function($scope, settings) {
    $scope.settings = [];
    settings.get('RaceInvitations.getParams').then(function (data) {
        $scope.settings = data;
    });
    $scope.$watch('settings', function(newSettings, oldSettings) {
        settings.set('RaceInvitations.setParams', newSettings, oldSettings);
    }, true);
})
.controller('StyleCtrl', function($scope, Background) {
    $scope.skins = [];
    $scope.active = null;
    Background.call('Skin.getActive').then(function(res) {
        $scope.active = res;
    });

    Background.call('Skin.getAll').then(function(res) {
        $scope.skins = res;
    });

    $scope.$watch('active', function(a, b) {
        if (typeof b != 'object') {
            Background.call('Skin.setActive', a);
        }
    });
})
.controller('ScriptCtrl', function($scope, $q, Background) {
    $scope.tags = {};
    $scope.showIntegrated = false;
    $scope.showBroken = false;
    $scope.status = null;
    $scope.syncing = false;
    $scope.extensionId = chrome.runtime.id;

    function load() {
        return $q.all([
            Background.call('UserJS.getStatus'),
            Background.call('UserJS.getAllScripts'),
        ]).then(function (res) {
            $scope.status = res[0];
            var scripts = res[1];
            $scope.scripts = scripts;
            for (var key in scripts) {
                scripts[key].tags.forEach(function (tag) {
                    if (!$scope.tags[tag]) {
                        $scope.tags[tag] = { text: tag, active: false };
                    }
                });
            }
        });
    }

    // Re-apply registrations: the user may have just allowed the userScripts API.
    Background.call('UserJS.sync').finally(load);
    load();

    $scope.sync = function () {
        $scope.syncing = true;
        Background.call('UserJS.sync').then(load).finally(function () {
            $scope.syncing = false;
        });
    };

    // Firefox: the userScripts permission is optional and must be requested
    // from a user gesture.
    $scope.requestPermission = function () {
        chrome.permissions.request({ permissions: ['userScripts'] }).then(function (granted) {
            if (granted) {
                $scope.$applyAsync($scope.sync);
            }
        });
    };

    $scope.toggle = function (name, event) {
        if (event.target.id === name || $scope.scripts[name].broken || !$scope.scripts[name].available) {
            return false;
        }
        $scope.scripts[name].disabled = !$scope.scripts[name].disabled;
        $scope.onChange(name);
    };

    $scope.onChange = function (name) {
        var scripts = $scope.scripts;
        if (scripts[name].disabled) {
            return $scope.save(name);
        }

        var disabled = [];
        scripts[name].conflicts.forEach(function (conflictName) {
            if (scripts[conflictName] && !scripts[conflictName].disabled) {
                disabled.push(conflictName);
                scripts[conflictName].disabled = true;
                $scope.save(conflictName);
            }
        });

        if (disabled.length > 0) {
            alert('Следующие скрипты были отключены, т.к. они конфликтуют ' +
                    'с ' + name + ":\n\n" + disabled.join(', '));
        }

        $scope.save(name);
    };

    $scope.save = function (name) {
        Background.call('UserJS.updateScriptData', name, {
            disabled: $scope.scripts[name].disabled,
        });
    };
})
.controller('CompetitionCtrl', function($scope, Background) {
    $scope.delay = null;
    $scope.audio = null;
    $scope.onlyWithPlayers = null;
    $scope.minimalPlayersNumber = null;

    $scope.rates = {
        x1: false,
        x2: false,
        x3: false,
        x5: false
    };

    Background.call('Competitions.getParams').then(function(res) {
        $scope.delay = res.delay;
        $scope.audio = res.audio;
        $scope.onlyWithPlayers = res.onlyWithPlayers;
        $scope.minimalPlayersNumber = res.minimalPlayersNumber;
        for(var i=0; i<res.rates.length; i++) {
            if(typeof $scope.rates['x'+res.rates[i]] == 'boolean') {
                $scope.rates['x'+res.rates[i]] = true;
            }
        }
    });

    function sendPrefs(data) {
        Background.call('Competitions.setParams', data);
    };

    $scope.change = function() {
        var arr = [];
        for(var rate in $scope.rates) {
            if($scope.rates[rate])
                arr.push(parseInt(rate.match(/\d+/)[0]));
        }

        sendPrefs({rates: arr});
    }

    // TODO: refactor this ugly code:
    $scope.$watch('delay', function(a, b) {
        if (typeof b != 'object') {
            sendPrefs({ delay: parseInt(a) });
        }
    });
    $scope.$watch('audio', function(a, b) {
        if (typeof b != 'object') {
            sendPrefs({ audio: a });
        }
    });
    $scope.$watch('onlyWithPlayers', function(a, b) {
        if (typeof b != 'object') {
            sendPrefs({ onlyWithPlayers: !!a });
        }
    });
    $scope.$watch('minimalPlayersNumber', function(a, b) {
        if (typeof b != 'object') {
            sendPrefs({ minimalPlayersNumber: parseInt(a) });
        }
    });
})
.filter('filterByTags', function () {
    return function (input, tags) {
        var active = false;
        for (var key in tags) {
            if (tags[key].active) {
                active = true;
                break;
            }
        }

        if (!active) {
            return input;
        }

        var filtered = {};
        for (var key in input) {
            input[key].tags.forEach(function (tag) {
                if (tags[tag] && tags[tag].active) {
                    filtered[key] = input[key];
                }
            });
        }
        return filtered;
    }
})
.filter('settingDescription', function () {
    return function (input) {
        switch (input) {
            case 'useWebSockets': return 'Использовать WebSocket соединение с сайтом.';
            case 'notifyRaceInvitations': return 'Уведомлять о приглашениях в заезд от друзей';
        }
    }
})
.filter('skin', function() {
    return function(input) {
        switch(input) {
            case 'beige': return 'Бежевый';
            case 'green': return 'Зелёный';
            case 'pink': return 'Розовый';
            case 'blue': return 'Синий';
            case 'violet': return 'Фиолетовый';
            case 'gray': return 'Серый';
            case 'nikitakozin': return 'Минималистический стиль, убирающий лишний цветовой шум. Автор nikitakozin.';
            default: return input;
        }
    }
});

angular.element(function() {
    angular.bootstrap(document.body, ['klavotools']);
});
