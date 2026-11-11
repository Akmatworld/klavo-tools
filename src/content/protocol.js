/**
 * @file Redirects klavogonki.ru pages to the configured protocol (HTTP/HTTPS).
 */
(function () {
    if (location.host !== 'klavogonki.ru') {
        return;
    }
    // Do not modify location on the password reset page with the `key` param.
    // See https://github.com/Fenex/klavotools-kango/issues/45
    if (/\/remind.*[?&]key=[\da-fA-F]{32}/.test(location.href)) {
        return;
    }
    chrome.runtime.sendMessage({
        name: 'protocol/opened-tab',
        url: location.href,
    }, function (response) {
        if (chrome.runtime.lastError) {
            return;
        }
        if (response && response.redirect) {
            location.href = response.redirect;
        }
    });
})();
