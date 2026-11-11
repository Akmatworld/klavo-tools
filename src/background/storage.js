/**
 * @file A synchronous-read cache over chrome.storage.local (replaces kango.storage).
 * Call `storage.load()` once at startup; after that `getItem()` is synchronous and
 * `setItem()` writes through to chrome.storage.local.
 */

const cache = new Map();
let loaded = null;

export const storage = {
    load() {
        if (!loaded) {
            loaded = chrome.storage.local.get(null).then((items) => {
                for (const key of Object.keys(items)) {
                    // Do not overwrite values set before the load finished:
                    if (!cache.has(key)) {
                        cache.set(key, items[key]);
                    }
                }
            });
        }
        return loaded;
    },

    getItem(key) {
        const value = cache.get(key);
        // Return a copy, so callers can't mutate the cached value by accident:
        return value === undefined ? null : structuredClone(value);
    },

    setItem(key, value) {
        // JSON round-trip drops functions/undefined, like localStorage-based kango.storage did:
        const plain = value === undefined ? null : JSON.parse(JSON.stringify(value));
        cache.set(key, plain);
        return chrome.storage.local.set({ [key]: plain }).catch((error) => {
            console.error('KlavoTools: storage write failed for "' + key + '"', error);
        });
    },

    removeItem(key) {
        cache.delete(key);
        return chrome.storage.local.remove(key);
    },
};
