/**
 * @file Polls the number of unread private messages. Used only when WebSockets
 * are disabled in settings.
 * @listens AuthStateChanged
 * @fires UnreadMessagesNumber
 */
import { bus, MutableModule } from './bus.js';
import { request } from './http.js';
import { onAlarm } from './app.js';
import { ALARMS, PM_DATA_URL } from './constants.js';

export class UnreadPMCounter extends MutableModule {
    constructor() {
        super();
        onAlarm(ALARMS.PM_COUNTER, () => this._check());
        this.addMessageListener('AuthStateChanged', (event) => {
            chrome.alarms.clear(ALARMS.PM_COUNTER);
            if (event.data.id) {
                chrome.alarms.create(ALARMS.PM_COUNTER, { periodInMinutes: 1 });
                this._check();
            }
        });
    }

    async _check() {
        try {
            const data = await request({ url: PM_DATA_URL, contentType: 'json' });
            if (!data || !Array.isArray(data.messages)) {
                throw new Error('PM data is not available');
            }
            const unread = data.messages
                .filter((message) => message.folder === 'in')
                .reduce((sum, message) => sum + (message.unread || 0), 0);
            bus.emit('UnreadMessagesNumber', unread);
            return unread;
        } catch (error) {
            console.log('KlavoTools: error while fetching PM data: ' + error);
            return null;
        }
    }

    teardown() {
        super.teardown();
        onAlarm(ALARMS.PM_COUNTER, () => {});
        chrome.alarms.clear(ALARMS.PM_COUNTER);
    }
}
