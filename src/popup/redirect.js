angular.module('popup.redirect', [])
.constant('RedirectMode', {
    UNDEFINED: 0,
    CURRENT: 1,
    NEWTAB: 2,
    BACKGROUND: 3,
})
.factory('Auth', function(Background) {
    var auth = {
        login: null,
        id: null
    };

    Background.call('Auth.getState').then(function(res) {
        auth.login = res && res.login;
        auth.id = res && res.id;
    });

    return auth;
})
.factory('Redirect', function(RedirectMode, Auth) {
    var extensionURI = chrome.runtime.getURL('/');

    function replacer(url) {
        if(/^__FALSE__$/.test(url)) {
            return false;
        }
        if(/__USERID__/.test(url)) {
            if(!Auth.id)
                return false;
            url = url.replace(/__USERID__/, Auth.id);
        }
        if(/^__EXTENSION_OPTIONS__$/.test(url)) {
            chrome.runtime.openOptionsPage();
            window.close();
            return null;
        } else if(/__EXTENSION__/.test(url)) {
            url = url.replace(/__EXTENSION__/, extensionURI);
        }
        else if(!(/^https?:\/\//.test(url))) {
            if(url[0] != '/')
                url = '/' + url;
            url = 'https://klavogonki.ru' + url;
        }

        return url;
    }

    return function(url, mode) {
        url = replacer(url);
        if(!url)
            return;
        switch(mode) {
            case RedirectMode.UNDEFINED:
                break;
            case RedirectMode.BACKGROUND:
                chrome.tabs.create({ url: url, active: false });
                break;
            case RedirectMode.CURRENT:
                chrome.tabs.query({ active: true, currentWindow: true }).then(function (found) {
                    var promise = found[0]
                        ? chrome.tabs.update(found[0].id, { url: url })
                        : chrome.tabs.create({ url: url });
                    return promise.then(function () { window.close(); });
                });
                break;
            default:
                chrome.tabs.create({ url: url, active: true });
                break;
        }
    };
});
