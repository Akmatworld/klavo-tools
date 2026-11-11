/**
 * @file A wrapper for the extension toolbar button (chrome.action).
 * @listens AuthStateChanged
 * @listens SocketConnected
 * @listens UnreadMessagesNumber
 */
import { bus } from './bus.js';
import { BUTTON_BADGE_COLOR, ICON_AUTH, ICON_DEFAULT, ICON_UNREAD } from './constants.js';

export class Button {
    constructor() {
        this._authId = null;
        this.setState({ authorized: false });

        bus.on('AuthStateChanged', (event) => this._update(event));

        // Using the WebSocket connection to get the number of unread PM:
        bus.on('SocketConnected', () => {
            if (!this._authId) {
                return;
            }
            bus.emit('SocketSubscribe', {
                ['counters:' + this._authId + '/unreadMail']: (data) => {
                    this.setState({ authorized: true, unreadMessagesNumber: data.newAmount });
                },
            });
        });

        // Fallback (no WebSockets) counter:
        bus.on('UnreadMessagesNumber', (event) => {
            this.setState({ authorized: true, unreadMessagesNumber: event.data });
        });
    }

    /**
     * @param {Object} state
     * @param {boolean} [state.authorized]
     * @param {number} [state.unreadMessagesNumber]
     */
    setState(state) {
        let icon = ICON_DEFAULT;
        let text = '';
        if (state.authorized) {
            icon = ICON_AUTH;
            if (state.unreadMessagesNumber > 0) {
                icon = ICON_UNREAD;
                text = String(state.unreadMessagesNumber);
            }
        }
        const ignore = () => {};
        chrome.action.setIcon({ path: icon }).catch(ignore);
        chrome.action.setBadgeBackgroundColor({ color: BUTTON_BADGE_COLOR }).catch(ignore);
        chrome.action.setBadgeText({ text }).catch(ignore);
    }

    _update(event) {
        const state = event.data;
        this._authId = state.id || null;
        if (state.id) {
            this.setState({ authorized: true, unreadMessagesNumber: state.unread_mail });
        } else {
            this.setState({ authorized: false });
        }
    }
}
