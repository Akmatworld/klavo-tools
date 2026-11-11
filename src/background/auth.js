/**
 * @file Auth module. Represents the current session state of the user.
 * @fires AuthStateChanged
 */
import { bus } from './bus.js';
import { request } from './http.js';
import { SITE_URL } from './constants.js';

const RELOGIN_ATTEMPTS = 10;
const SESSION_KEY = 'auth_logged_out';

/** chrome.storage.session survives service worker restarts, but not browser restarts. */
function rememberLoggedOut(value) {
    if (chrome.storage.session) {
        chrome.storage.session.set({ [SESSION_KEY]: value }).catch(() => {});
    }
}

async function wasLoggedOut() {
    if (!chrome.storage.session) {
        return false;
    }
    try {
        const items = await chrome.storage.session.get(SESSION_KEY);
        return items[SESSION_KEY] === true;
    } catch (error) {
        return false;
    }
}
const RELOGIN_DELAY = 5000;

export class Auth {
    constructor() {
        this._state = {};
        this._reloginTimer = null;
        this._onSocketError = () => this.relogin();
        bus.on('SocketError', this._onSocketError);
        // After a service worker restart, don't re-fetch the site if we already know
        // the user is logged out: a login is reported by the content script anyway.
        wasLoggedOut().then((loggedOut) => {
            if (!loggedOut) {
                this.login().catch(() => this.relogin());
            }
        });
    }

    _broadcastStateChange() {
        rememberLoggedOut(!this._state.id);
        bus.emit('AuthStateChanged', this._state);
    }

    /** Fetches the session information from the site main page. */
    async _fetchState() {
        const body = await request(SITE_URL + '/');
        const match = body.match(/constant\(\s*'Me',\s*(.+)\s*\)/);
        if (!match) {
            throw new Error('Session data not found on the page');
        }
        return JSON.parse(match[1]) || {};
    }

    getState() {
        return this._state;
    }

    /**
     * Repeatedly calls login() (if it fails) with 5 seconds delays, up to 10 times.
     * @param {number} [madeAttempts=0]
     */
    relogin(madeAttempts = 0) {
        if (this._state.id) {
            this.logout();
        }
        clearTimeout(this._reloginTimer);
        if (madeAttempts >= RELOGIN_ATTEMPTS) {
            console.log('KlavoTools: giving up after ' + RELOGIN_ATTEMPTS + ' unsuccessful login attempts');
            return;
        }
        this._reloginTimer = setTimeout(() => {
            console.log('KlavoTools: relogin attempt #' + (madeAttempts + 1));
            this.login().catch(() => this.relogin(madeAttempts + 1));
        }, RELOGIN_DELAY);
    }

    async login() {
        try {
            const state = await this._fetchState();
            this._state = state;
            this._broadcastStateChange();
            return state;
        } catch (error) {
            console.log('KlavoTools: failed to fetch the session state: ' + error);
            throw error;
        }
    }

    logout() {
        this._state = {};
        this._broadcastStateChange();
    }

    /**
     * Handles a user id reported by the content script.
     * @param {(number|null)} userId
     */
    checkState(userId) {
        if (this._state.id !== userId) {
            if (userId) {
                this.login().catch(() => this.relogin());
            } else {
                this.logout();
            }
        }
    }
}
