/**
 * @file Notifications helpers: deferred notifications, sound playback and
 * remote icons support for the service worker.
 */

import { keepAlive } from './keepalive.js';

const FALLBACK_ICON = '/icons/icon128.png';
const clickHandlers = [];

/**
 * Registers a notification click handler. Handlers are called in order until
 * one of them returns true.
 * @param {function(string): boolean} handler
 */
export function onNotificationClicked(handler) {
    clickHandlers.push(handler);
}

/** Dispatches chrome.notifications.onClicked (the listener is set up in index.js). */
export function dispatchNotificationClick(id) {
    for (const handler of clickHandlers) {
        if (handler(id)) {
            return;
        }
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

/**
 * Converts a remote image URL into a data: URL (remote icons are not reliable for
 * chrome.notifications in MV3). Local URLs are returned as is.
 * @param {string} url
 * @returns {Promise.<string>}
 */
export async function resolveIconUrl(url) {
    if (!url || !/^https?:/.test(url)) {
        return url || FALLBACK_ICON;
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        const type = response.headers.get('content-type') || 'image/png';
        const buffer = await response.arrayBuffer();
        return 'data:' + type.split(';')[0] + ';base64,' + arrayBufferToBase64(buffer);
    } catch (error) {
        console.log('KlavoTools: failed to load the notification icon ' + url + ': ' + error);
        return FALLBACK_ICON;
    }
}

/**
 * Creates a notification.
 * @param {string} id
 * @param {{title: string, message: string, iconUrl: string}} options
 */
export async function createNotification(id, options) {
    const iconUrl = await resolveIconUrl(options.iconUrl);
    try {
        await chrome.notifications.create(id, {
            type: 'basic',
            title: options.title,
            message: options.message,
            iconUrl,
        });
    } catch (error) {
        // The icon may be broken: retry with the default one.
        if (iconUrl !== FALLBACK_ICON) {
            await chrome.notifications.create(id, {
                type: 'basic',
                title: options.title,
                message: options.message,
                iconUrl: FALLBACK_ICON,
            });
        } else {
            throw error;
        }
    }
}

/**
 * Plays an extension audio file. A service worker has no Audio, so in Chrome an
 * offscreen document is used; in Firefox (event page) the Audio API is available.
 * @param {string} path An extension resource path, e.g. '/res/competition.ogg'
 */
export async function playSound(path) {
    const url = chrome.runtime.getURL(path);
    if (typeof Audio !== 'undefined') {
        await new Audio(url).play();
        return;
    }
    if (!chrome.offscreen) {
        return;
    }
    const offscreenUrl = chrome.runtime.getURL('/offscreen/offscreen.html');
    const contexts = chrome.runtime.getContexts
        ? await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [offscreenUrl],
        })
        : [];
    if (!contexts.length) {
        try {
            await chrome.offscreen.createDocument({
                url: offscreenUrl,
                reasons: ['AUDIO_PLAYBACK'],
                justification: 'Sound notification about a starting competition',
            });
        } catch (error) {
            // "Only a single offscreen document may be created" — it already exists.
            if (!/single offscreen/i.test(String(error && error.message))) {
                throw error;
            }
        }
    }
    await chrome.runtime.sendMessage({ target: 'offscreen', name: 'play', url });
}

/**
 * A notification shown after a delay.
 * @example
 * const n = new DeferredNotification('id', { title, message, iconUrl, audioUrl });
 * n.before = async () => true; // optional: return false to cancel
 * n.show(5);
 */
export class DeferredNotification {
    /**
     * @param {(string|number)} id
     * @param {{title: string, message: string, iconUrl: string, audioUrl: (string|undefined)}} options
     *  `audioUrl` is an extension resource path.
     */
    constructor(id, options) {
        if (id === undefined || options === undefined) {
            throw new TypeError('Not enough arguments to DeferredNotification\'s constructor');
        }
        if (typeof options !== 'object' || options === null) {
            throw new TypeError('Argument 2 of DeferredNotification should be an object');
        }
        this.id = id.toString();
        this.options = Object.assign({}, options);
        this.before = undefined;
        this._timeout = null;
    }

    revoke() {
        clearTimeout(this._timeout);
        keepAlive.release('notification:' + this.id);
        chrome.notifications.clear(this.id).catch(() => {});
    }

    /** @param {number} [delay=0] Delay in seconds. */
    show(delay = 0) {
        clearTimeout(this._timeout);
        // Keep the service worker alive until the timer fires:
        keepAlive.acquire('notification:' + this.id);
        this._timeout = setTimeout(async () => {
            keepAlive.release('notification:' + this.id);
            try {
                if (typeof this.before === 'function' && (await this.before.call(this)) === false) {
                    return;
                }
                await createNotification(this.id, this.options);
                if (this.options.audioUrl !== undefined) {
                    await playSound(this.options.audioUrl);
                }
            } catch (error) {
                console.error('KlavoTools: failed to show the notification', error);
            }
        }, delay * 1000);
    }
}
