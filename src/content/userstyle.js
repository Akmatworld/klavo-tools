/**
 * @file Applies the active KlavoTools skin (CSS from res/skins.css) to the page.
 * Reads the setting directly from chrome.storage, so no round trip to the
 * (possibly sleeping) service worker is needed, and follows live changes.
 */
(function () {
    var SKINS = ['beige', 'pink', 'green', 'blue', 'violet', 'gray', 'nikitakozin'];
    var root = document.documentElement;
    var current = null;

    function apply(name) {
        if (SKINS.indexOf(name) === -1) {
            name = 'beige';
        }
        if (current) {
            root.classList.remove(current);
        }
        root.classList.add('skin', name);
        current = name;
    }

    root.classList.add('skin');
    chrome.storage.local.get('skin', function (items) {
        apply(items && items.skin);
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes.skin) {
            apply(changes.skin.newValue);
        }
    });
})();
