export const BUTTON_BADGE_COLOR = [255, 0, 0, 255];
export const ICON_DEFAULT = '/icons/button_default.png';
export const ICON_AUTH = '/icons/button_auth.png';
export const ICON_UNREAD = '/icons/button_unread.png';

export const SITE_URL = 'https://klavogonki.ru';
export const WS_BASE_URL = 'wss://klavogonki.ru/ws';
export const GAMELIST_DATA_URL = 'https://klavogonki.ru/gamelist.data?KTS_REQUEST';
export const PM_DATA_URL = 'https://klavogonki.ru/api/profile/get-messages-contacts?KTS_REQUEST';

export const USERJS_REPO_URL = 'https://raw.githubusercontent.com/voidmain02/KgScripts/master';
export const USERJS_CONFIG_URL = USERJS_REPO_URL + '/klavotools.json';
export const USERJS_DIRECTORY_URL = USERJS_REPO_URL + '/scripts';

/** Match patterns for the pages where KlavoTools works. */
export const SITE_MATCHES = ['*://klavogonki.ru/*', '*://*.klavogonki.ru/*'];

export const ALARMS = {
    // Wakes the service worker up periodically, so the WebSocket connection
    // is restored if the worker was terminated by the browser:
    WATCHDOG: 'kts-watchdog',
    USERJS_SYNC: 'kts-userjs-sync',
    PM_COUNTER: 'kts-pm-counter',
    COMPETITIONS_POLL: 'kts-competitions-poll',
};
