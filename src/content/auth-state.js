/**
 * @file Reports logins and logouts on the site to the background.
 */
document.addEventListener('DOMContentLoaded', function () {
    try {
        var testPage = document.querySelector('#head .login-block + .menu');
        if (!testPage) {
            // A page with no session data.
            return;
        }

        var link = document.querySelector('.user-dropdown .dropmenu a.btn');
        var match = link && link.href.match(/\d+/);
        chrome.runtime.sendMessage({
            name: 'authUserId',
            id: match ? match[0] * 1 : null,
        }, function () {
            // Ignore "Receiving end does not exist" errors.
            void chrome.runtime.lastError;
        });
    } catch (err) {
        console.error('KlavoTools: auth state content script failed: ' + err);
    }
});
