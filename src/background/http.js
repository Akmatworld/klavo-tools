/**
 * @file fetch() wrapper replacing kango.xhr.send().
 */

/**
 * @param {(string|Object)} settings A URL, or an object:
 * @param {string} settings.url
 * @param {string} [settings.method='GET']
 * @param {Object} [settings.params] Form parameters (sent as x-www-form-urlencoded body).
 * @param {string} [settings.contentType] 'json' to parse the response as JSON.
 * @param {string} [settings.credentials='include'] fetch() credentials mode.
 * @returns {Promise.<(Object|string)>}
 */
export async function request(settings) {
    if (typeof settings === 'string') {
        settings = { url: settings };
    } else if (!settings || !settings.url) {
        throw new TypeError('URL not specified');
    }

    const init = {
        method: settings.method || 'GET',
        // Cookies are needed for klavogonki.ru; CORS with `*` (GitHub) requires 'omit':
        credentials: settings.credentials || 'include',
        cache: 'no-store',
    };

    if (settings.params) {
        init.body = new URLSearchParams(settings.params);
    }

    const response = await fetch(settings.url, init);
    if (!response.ok) {
        const error = new Error('HTTP ' + response.status + ' for ' + settings.url);
        error.status = response.status;
        throw error;
    }

    return settings.contentType === 'json' ? response.json() : response.text();
}
