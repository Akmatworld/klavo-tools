/**
 * @file Desktop notifications on race invitations.
 * @listens AuthStateChanged
 * @listens SocketConnected
 * @listens Socket#gameInvite:{userId}
 */
import { bus, MutableModule } from './bus.js';
import { storage } from './storage.js';
import { app } from './app.js';
import { createNotification } from './notifications.js';

const STORAGE_ID = 'race_invitations_settings';
const NOTIFICATION_RE = /^raceInvitation(\d+)$/;

export class RaceInvitations extends MutableModule {
    constructor() {
        super();
        this._settings = storage.getItem(STORAGE_ID) || { notifyRaceInvitations: true };
        this._init();
    }

    getParams() {
        return this._settings;
    }

    setParams(params) {
        for (const key in params) {
            this._settings[key] = params[key];
        }
        storage.setItem(STORAGE_ID, this._settings);
    }

    handleNotificationClick(id) {
        const match = id.match(NOTIFICATION_RE);
        if (!match) {
            return false;
        }
        app.tabs.createOrNavigateExisting(app.Protocol.convert('/g/?gmid=' + match[1]));
        chrome.notifications.clear(id).catch(() => {});
        return true;
    }

    _createNotification(game) {
        const avatar = game.invited_by.avatar;
        const iconUrl = avatar
            ? 'https://klavogonki.ru' + avatar.replace('.png', '_big.png')
            : 'https://klavogonki.ru/img/avatar_dummy.gif';
        const message = game.invited_by.login + ' приглашает вас в '
            + (game.type === 'private' ? 'игру с друзьями' : 'игру') + ' '
            + game.gametype_html.replace(/<(?:.|\n)*?>/gm, '')
                .replace(/&laquo;/g, '«')
                .replace(/&raquo;/g, '»');

        return createNotification('raceInvitation' + game.game_id, {
            title: 'Приглашение в игру',
            message,
            iconUrl,
        });
    }

    async _processInvite(game) {
        if (!this._settings.notifyRaceInvitations) {
            return;
        }
        if (!game || !game.invited_by || !game.gametype_html || !game.game_id) {
            throw new TypeError('Wrong data for the _processInvite method');
        }
        // Don't notify if the game page is already opened:
        if (!(await app.tabs.hasGameTab(game.game_id))) {
            await this._createNotification(game);
        }
    }

    _init() {
        this.addMessageListener('AuthStateChanged', (event) => {
            const authId = event.data.id;
            if (authId) {
                this.setMessageListener('SocketConnected', () => {
                    bus.emit('SocketSubscribe', {
                        ['gameInvite:' + authId]: (game) => {
                            this._processInvite(game).catch((error) => {
                                console.error('KlavoTools: race invitation failed', error);
                            });
                        },
                    });
                });
            }
        });
    }
}
