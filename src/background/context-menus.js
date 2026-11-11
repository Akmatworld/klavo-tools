/**
 * @file Context menus for links to user profiles and vocabularies.
 *
 * MV3: menus are created with static ids (no `onclick` callbacks); clicks are
 * handled by chrome.contextMenus.onClicked (the listener is set up in index.js).
 */
import { bus } from './bus.js';
import { app } from './app.js';

export const USER_MENU = {
    id: 'user',
    urlPatterns: ['*://klavogonki.ru/profile/*', '*://klavogonki.ru/u/*'],
    items: [
        { label: 'Открыть диалог', url: '/u/#/{auth_id}/messages/{user_id}', authorized: true },
        { label: 'Сводка', url: '/u/#/{user_id}' },
        { label: 'Статистика', url: '/u/#/{user_id}/stats/' },
        { label: 'Бортжурнал', url: '/u/#/{user_id}/journal/' },
        { label: 'Достижения', url: '/u/#/{user_id}/achievements/' },
        { label: 'Друзья', url: '/u/#/{user_id}/friends/' },
        { label: 'Гараж', url: '/u/#/{user_id}/car/' },
    ],
};

export const VOC_MENU = {
    id: 'voc',
    urlPatterns: ['*://klavogonki.ru/vocs/*'],
    items: [
        { label: 'Информация', url: '/vocs/{voc_id}' },
        {
            label: 'Играть',
            items: [
                {
                    label: 'Открытый заезд, 10 сек',
                    url: '/create/?gametype=voc&type=normal&level_from=1&level_to=9&timeout=10&submit=1&voc={voc_id}',
                },
                {
                    label: 'Открытый заезд, 20 сек',
                    url: '/create/?gametype=voc&type=normal&level_from=1&level_to=9&timeout=20&submit=1&voc={voc_id}',
                },
                {
                    label: 'Одиночный заезд, 5 сек',
                    url: '/create?gametype=voc&type=practice&level_from=1&level_to=9&timeout=5&submit=1&voc={voc_id}',
                },
                {
                    label: 'Заезд с друзьями, 10 сек',
                    url: '/create/?gametype=voc&type=private&level_from=1&level_to=9&timeout=10&submit=1&voc={voc_id}',
                    authorized: true,
                },
                {
                    label: 'Квалификация, 5 сек',
                    url: '/create/?gametype=voc&type=practice&level_from=1&level_to=9&timeout=5&submit=1&qual=1&voc={voc_id}',
                },
            ],
        },
        { label: 'Рекорды', url: '/vocs/{voc_id}/top' },
        { label: 'История', url: '/vocs/{voc_id}/history' },
        { label: 'Комментарии', url: '/vocs/{voc_id}/comments' },
    ],
};

/**
 * Parses a link href for a user or vocabulary id.
 * @param {string} url
 * @returns {{user_id: (string|undefined), voc_id: (string|undefined)}}
 */
export function parseLinkURL(url) {
    const matches = String(url).match(/(profile|u\/#|vocs)\/(\d+)/);
    if (!matches) {
        return {};
    }
    return matches[1] === 'vocs' ? { voc_id: matches[2] } : { user_id: matches[2] };
}

/**
 * Substitutes variables into the URL path template.
 * @param {string} template
 * @param {string} href The href of the clicked link.
 * @param {(number|null)} authId
 * @returns {string}
 */
export function makeRedirectURL(template, href, authId) {
    let result = template;
    if (authId) {
        result = result.replace(/{auth_id}/g, authId);
    }
    const params = parseLinkURL(href);
    for (const field in params) {
        result = result.replace(new RegExp('{' + field + '}', 'g'), params[field]);
    }
    return result;
}

/**
 * Flattens a menu structure into a list of chrome.contextMenus items with
 * deterministic ids.
 */
export function flattenMenu(menu) {
    const result = [];
    const walk = (items, prefix, parentId) => {
        items.forEach((item, index) => {
            const id = prefix + '.' + index;
            result.push({
                id,
                parentId,
                title: item.label,
                url: item.url,
                authorized: !!item.authorized,
                urlPatterns: menu.urlPatterns,
            });
            if (Array.isArray(item.items)) {
                walk(item.items, id, id);
            }
        });
    };
    walk(menu.items, menu.id, undefined);
    return result;
}

export class ContextMenus {
    constructor() {
        this._items = new Map();
        for (const item of [...flattenMenu(USER_MENU), ...flattenMenu(VOC_MENU)]) {
            this._items.set(item.id, item);
        }
        this._created = this._create();
        bus.on('AuthStateChanged', (event) => this._updateAuthDependent(!!event.data.id));
    }

    async _create() {
        await chrome.contextMenus.removeAll();
        const authorized = !!(app.Auth && app.Auth.getState().id);
        for (const item of this._items.values()) {
            await new Promise((resolve) => {
                chrome.contextMenus.create({
                    id: item.id,
                    parentId: item.parentId,
                    title: item.title,
                    contexts: ['link'],
                    targetUrlPatterns: item.urlPatterns,
                    enabled: item.authorized ? authorized : true,
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.log('KlavoTools: context menu error: ' + chrome.runtime.lastError.message);
                    }
                    resolve();
                });
            });
        }
    }

    async _updateAuthDependent(authorized) {
        await this._created;
        for (const item of this._items.values()) {
            if (item.authorized) {
                chrome.contextMenus.update(item.id, { enabled: authorized }).catch(() => {});
            }
        }
    }

    /** chrome.contextMenus.onClicked handler. */
    handleClick(info, tab) {
        const item = this._items.get(info.menuItemId);
        if (!item || !item.url || !tab) {
            return;
        }
        const path = makeRedirectURL(item.url, info.linkUrl, app.Auth.getState().id);
        // Keep the protocol and host of the page the menu was opened on:
        const origin = new URL(tab.url || info.pageUrl).origin;
        chrome.tabs.update(tab.id, { url: origin + path });
    }
}
