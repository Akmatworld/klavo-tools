/**
 * @file Controls the protocol (HTTP/HTTPS) of opened klavogonki.ru pages.
 */
import { storage } from './storage.js';

export const ProtocolTypes = [
    'HTTPS', // opens new tabs over https
    'HTTP', // ... over http
    'prev', // ... over same last opened page's protocol
];

export class Protocol {
    static get defaultCfg() {
        return {
            type: 'prev',
            redirect: true,
        };
    }

    constructor() {
        const settings = storage.getItem('settings');
        this.config = settings && settings.protocol !== undefined
            ? settings.protocol
            : Protocol.defaultCfg;
        this.is_last_protocol_https = true;
    }

    /**
     * Handles `protocol/*` runtime messages.
     * @returns {Object|undefined} A response, or undefined if the message is not ours.
     */
    handleMessage(message) {
        const key = typeof message.name === 'string' && message.name.match(/^protocol\/(.+)$/);
        if (!key) {
            return undefined;
        }

        switch (key[1]) {
            case 'config': return { config: this.config };
            case 'get': return { protocol: this.get() };
            case 'set':
                this.saveCfg(message.value);
                return { ok: 1 };
            case 'opened-tab': return { redirect: this.redirect(message.url) };
            case 'convert': return { url: this.convert(message.url) };
            default: return { err: 'unknown key: `' + key[1] + '`' };
        }
    }

    /**
     * Returns the URL to redirect the opened page to, or false.
     * @param {string} url
     * @returns {(string|false)}
     */
    redirect(url) {
        const m = url.match(/^http(s)?:\/\/(klavogonki\.ru.+)$/);
        if (m) {
            const isHttps = !!m[1];
            if (this.config.redirect && this.config.type !== 'prev') {
                if (isHttps && this.config.type === 'HTTP') {
                    this.is_last_protocol_https = false;
                    return 'http://' + m[2];
                }
                if (!isHttps && this.config.type === 'HTTPS') {
                    this.is_last_protocol_https = true;
                    return 'https://' + m[2];
                }
            }

            this.is_last_protocol_https = isHttps;
        }

        return false;
    }

    get() {
        switch (this.config.type) {
            case 'HTTP': return 'http';
            case 'HTTPS': return 'https';
            default:
                return this.is_last_protocol_https ? 'https' : 'http';
        }
    }

    /**
     * Converts a klavogonki.ru URL (or a path) to an absolute URL with the
     * configured protocol.
     * @param {string} url
     * @returns {string}
     */
    convert(url) {
        const parsed = new URL(url, 'https://klavogonki.ru');
        if (parsed.hostname !== 'klavogonki.ru') {
            return parsed.href;
        }

        parsed.protocol = this.get() + ':';
        return parsed.href;
    }

    saveCfg(cfg) {
        if (cfg && ProtocolTypes.indexOf(cfg.type) !== -1
                && typeof cfg.redirect === 'boolean') {
            const settings = storage.getItem('settings') || {};
            settings.protocol = cfg;
            storage.setItem('settings', settings);

            // Change all properties instead of replacing the whole object,
            // because the object reference is shared with Settings:
            for (const key in cfg) {
                this.config[key] = cfg[key];
            }
        }
    }
}
