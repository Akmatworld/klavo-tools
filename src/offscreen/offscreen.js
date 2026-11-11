/**
 * @file Offscreen document for audio playback (Chrome service workers have no Audio API).
 */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.target !== 'offscreen') {
        return false;
    }
    if (message.name === 'play') {
        new Audio(message.url).play().then(
            function () { sendResponse({ ok: 1 }); },
            function (error) { sendResponse({ error: String(error) }); }
        );
        return true;
    }
    return false;
});
