/**
 * @file Keeps the MV3 service worker alive while there is an active WebSocket
 * connection with the site.
 *
 * Chrome terminates an idle service worker after 30 seconds; any extension API
 * call resets that timer (Chrome 110+), and WebSocket activity does too (Chrome 116+).
 * The klavogonki.ru server doesn't send heartbeat frames, so we ping an extension
 * API periodically. If the worker is terminated anyway, the watchdog alarm
 * (see index.js) wakes it up and the connection is restored.
 */

const INTERVAL = 20 * 1000;
const reasons = new Set();
let timer = null;

function ping() {
    chrome.runtime.getPlatformInfo().catch(() => {});
}

export const keepAlive = {
    acquire(reason) {
        reasons.add(reason);
        if (!timer) {
            timer = setInterval(ping, INTERVAL);
        }
    },

    release(reason) {
        reasons.delete(reason);
        if (!reasons.size && timer) {
            clearInterval(timer);
            timer = null;
        }
    },
};
