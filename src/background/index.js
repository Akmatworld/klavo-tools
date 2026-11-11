/**
 * @file KlavoTools background entry point (MV3 service worker in Chrome,
 * event page in Firefox).
 *
 * All extension event listeners are registered synchronously at the top level,
 * as required for service workers; they wait for the async initialization.
 */
import { storage } from './storage.js';
import { bus } from './bus.js';
import { app, dispatchAlarm, onAlarm } from './app.js';
import { ALARMS } from './constants.js';
import { tabs } from './tabs.js';
import { Protocol } from './protocol.js';
import { Skin } from './skin.js';
import { Auth } from './auth.js';
import { Socket } from './socket.js';
import { Button } from './button.js';
import { CompetitionsWS, CompetitionsXHR } from './competitions.js';
import { RaceInvitations } from './race-invitations.js';
import { UnreadPMCounter } from './unread-pm-counter.js';
import { ContextMenus } from './context-menus.js';
import { UserJS } from './userjs.js';
import { createNotification, dispatchNotificationClick, onNotificationClicked, playSound } from './notifications.js';

class Settings {
    constructor() {
        const saved = storage.getItem('settings') || {};
        this._useWebSockets = typeof saved.useWebSockets === 'boolean' ? saved.useWebSockets : true;
    }

    get() {
        return {
            useWebSockets: this._useWebSockets,
            protocol: app.Protocol.config,
        };
    }

    set(params) {
        params = params || {};
        if (params.protocol) {
            app.Protocol.saveCfg(params.protocol);
        }
        if (typeof params.useWebSockets === 'boolean' && params.useWebSockets !== this._useWebSockets) {
            this._useWebSockets = params.useWebSockets;
            const saved = storage.getItem('settings') || {};
            saved.useWebSockets = this._useWebSockets;
            saved.protocol = app.Protocol.config;
            storage.setItem('settings', saved);
            this.apply();
        }
    }

    /** Creates (or switches) the WebSocket-based or polling-based modules. */
    apply() {
        if (this._useWebSockets) {
            if (app.Competitions instanceof CompetitionsXHR) {
                app.Competitions.teardown();
                app.UnreadPMCounter.teardown();
                app.UnreadPMCounter = null;
            }
            if (!(app.Competitions instanceof CompetitionsWS)) {
                app.Competitions = new CompetitionsWS();
                app.Socket = new Socket();
            }
        } else {
            if (app.Competitions instanceof CompetitionsWS) {
                app.Competitions.teardown();
                app.Socket.teardown();
                app.Socket = null;
            }
            if (!(app.Competitions instanceof CompetitionsXHR)) {
                app.Competitions = new CompetitionsXHR();
                app.UnreadPMCounter = new UnreadPMCounter();
            }
        }

        if (!app.Auth) {
            app.Auth = new Auth();
        } else {
            // Force relogin to apply changes:
            app.Auth.logout();
            app.Auth.login().catch(() => app.Auth.relogin());
        }
    }
}

async function ensureAlarm(name, info) {
    const existing = await chrome.alarms.get(name);
    if (!existing) {
        await chrome.alarms.create(name, info);
    }
}

async function init() {
    await storage.load();

    app.bus = bus;
    app.tabs = tabs;
    app.notifications = { createNotification, playSound };
    app.Protocol = new Protocol();
    app.Skin = new Skin();
    app.UserJS = new UserJS();
    app.RaceInvitations = new RaceInvitations();
    app.Button = new Button();
    app.ContextMenus = new ContextMenus();
    app.Settings = new Settings();
    app.Settings.apply();

    onNotificationClicked((id) => app.Competitions.handleNotificationClick(id));
    onNotificationClicked((id) => app.RaceInvitations.handleNotificationClick(id));

    onAlarm(ALARMS.USERJS_SYNC, () => app.UserJS.sync());
    onAlarm(ALARMS.WATCHDOG, () => {
        // The worker is alive (or was just restarted, which re-runs init()).
        // Restore a lost WebSocket connection if the user is logged in:
        if (app.Socket && app.Auth.getState().id && !app.Socket._authorized && !app.Socket._ws) {
            app.Auth.relogin();
        }
    });

    await ensureAlarm(ALARMS.WATCHDOG, { periodInMinutes: 1 });
    await ensureAlarm(ALARMS.USERJS_SYNC, { delayInMinutes: 1, periodInMinutes: 15 });

    // Registrations persist between sessions; this only re-registers on changes
    // (e.g. after the user allowed the userScripts API):
    app.UserJS.apply().catch((error) => console.error('KlavoTools: userscripts apply failed', error));
}

// For debugging from the service worker console (like the global object in kango):
globalThis.KlavoTools = app;

const ready = init().catch((error) => {
    console.error('KlavoTools: initialization failed', error);
    throw error;
});

/* ---------------------------------------------------------------------------
 * Messaging
 * ------------------------------------------------------------------------- */

/** Methods callable from the extension pages (popup, options). */
const RPC = {
    'Settings.get': () => app.Settings.get(),
    'Settings.set': (params) => app.Settings.set(params),
    'RaceInvitations.getParams': () => app.RaceInvitations.getParams(),
    'RaceInvitations.setParams': (params) => app.RaceInvitations.setParams(params),
    'Competitions.getParams': () => app.Competitions.getParams(),
    'Competitions.setParams': (params) => app.Competitions.setParams(params),
    'Skin.getActive': () => app.Skin.getActive(),
    'Skin.getAll': () => app.Skin.getAll(),
    'Skin.setActive': (skin) => app.Skin.setActive(skin),
    'UserJS.getAllScripts': () => app.UserJS.getAllScripts(),
    'UserJS.updateScriptData': (name, data) => app.UserJS.updateScriptData(name, data),
    'UserJS.getStatus': () => app.UserJS.getStatus(),
    'UserJS.sync': () => app.UserJS.sync(),
    'Auth.getState': () => app.Auth.getState(),
    'tabs.create': (data) => app.tabs.create(data).then(() => true),
    'tabs.navigateCurrent': (url) => app.tabs.navigateCurrent(url).then(() => true),
};

function isExtensionPage(sender) {
    return sender.id === chrome.runtime.id
        && typeof sender.url === 'string'
        && sender.url.startsWith(chrome.runtime.getURL(''));
}

async function handleMessage(message, sender) {
    if (message.name === 'rpc') {
        if (!isExtensionPage(sender)) {
            throw new Error('RPC is allowed only from extension pages');
        }
        const method = RPC[message.method];
        if (!method) {
            throw new Error('Unknown RPC method: ' + message.method);
        }
        const result = await method(...(Array.isArray(message.args) ? message.args : []));
        return { result: result === undefined ? null : result };
    }

    if (message.name === 'authUserId') {
        app.Auth.checkState(message.id);
        return { ok: 1 };
    }

    const protocolResponse = app.Protocol.handleMessage(message);
    if (protocolResponse !== undefined) {
        return protocolResponse;
    }

    return undefined;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || message.target === 'offscreen') {
        return false;
    }
    ready
        .then(() => handleMessage(message, sender))
        .then(
            (response) => sendResponse(response),
            (error) => sendResponse({ error: String(error && error.message ? error.message : error) }),
        );
    return true;
});

/* ---------------------------------------------------------------------------
 * Other events
 * ------------------------------------------------------------------------- */

chrome.notifications.onClicked.addListener((id) => {
    ready.then(() => dispatchNotificationClick(id));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    ready.then(() => app.ContextMenus.handleClick(info, tab));
});

chrome.alarms.onAlarm.addListener((alarm) => {
    ready.then(() => dispatchAlarm(alarm));
});

chrome.runtime.onInstalled.addListener(() => {
    ready.then(() => app.UserJS.sync());
});

chrome.runtime.onStartup.addListener(() => {
    ready.then(() => app.UserJS.sync());
});

if (chrome.permissions && chrome.permissions.onAdded) {
    const onPermissionsChanged = (permissions) => {
        if (permissions.permissions && permissions.permissions.includes('userScripts')) {
            ready.then(() => app.UserJS.sync());
        }
    };
    chrome.permissions.onAdded.addListener(onPermissionsChanged);
    chrome.permissions.onRemoved.addListener(onPermissionsChanged);
}
