/**
 * @file Tabs helpers (replaces kango.browser.tabs).
 */

const SITE_RE = /^https?:\/\/(?:[^/]+\.)?klavogonki\.ru\//;

export const tabs = {
    /**
     * @param {{url: string, focused: (boolean|undefined)}} data
     */
    create(data) {
        return chrome.tabs.create({ url: data.url, active: data.focused !== false });
    },

    async navigateCurrent(url) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab) {
            return chrome.tabs.update(tab.id, { url });
        }
        return chrome.tabs.create({ url });
    },

    /** Navigates the active (or any) klavogonki.ru tab to the URL, or opens a new one. */
    async createOrNavigateExisting(url) {
        const all = await chrome.tabs.query({});
        const siteTabs = all.filter((tab) => tab.url && SITE_RE.test(tab.url));
        const found = siteTabs.find((tab) => tab.active) || siteTabs[0];

        if (!found) {
            return chrome.tabs.create({ url, active: true });
        }
        await chrome.tabs.update(found.id, { url, active: true });
        if (found.windowId !== undefined) {
            await chrome.windows.update(found.windowId, { focused: true }).catch(() => {});
        }
        return found;
    },

    /** Whether there is an opened tab with the given game page. */
    async hasGameTab(gameId) {
        const re = new RegExp('klavogonki\\.ru/g/\\?gmid=' + gameId + '$');
        const all = await chrome.tabs.query({});
        return all.some((tab) => tab.url && re.test(tab.url));
    },
};
