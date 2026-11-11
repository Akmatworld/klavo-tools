/**
 * @file Competitions module: watches for open competitions and notifies the user.
 * Two implementations: CompetitionsWS (site WebSocket) and CompetitionsXHR (polling).
 */
import { bus, MutableModule } from './bus.js';
import { storage } from './storage.js';
import { request } from './http.js';
import { app, onAlarm, scheduleAlarm } from './app.js';
import { DeferredNotification } from './notifications.js';
import { ALARMS, GAMELIST_DATA_URL } from './constants.js';

/**
 * @typedef {Object} CompetitionData
 * @property {number} id
 * @property {number} ratingValue 1, 2, 3 or 5.
 * @property {(string|number|null)} beginTime ISO 8601 string or a unix timestamp.
 * @property {DeferredNotification} [notification]
 */

export class Competitions extends MutableModule {
    constructor() {
        super();
        const rates = storage.getItem('competition_rates');
        const delay = storage.getItem('competition_delay');
        const minimal = storage.getItem('competition_minimalPlayersNumber');
        this.rates = Array.isArray(rates) ? rates : [3, 5];
        this.delay = typeof delay === 'number' ? delay : 60;
        this.audio = !!storage.getItem('competition_audio');
        this.onlyWithPlayers = !!storage.getItem('competition_onlyWithPlayers');
        this.minimalPlayersNumber = typeof minimal === 'number' ? minimal : 2;

        /** @type {Object.<string, CompetitionData>} */
        this._hash = {};
        // Server time delta in milliseconds; set by the implementing class:
        this._timeCorrection = null;
        this._init();
    }

    /** Handles a notification click. @returns {boolean} Whether it was ours. */
    handleNotificationClick(id) {
        if (!(id in this._hash)) {
            return false;
        }
        app.tabs.createOrNavigateExisting(app.Protocol.convert('/g/?gmid=' + id));
        chrome.notifications.clear(id).catch(() => {});
        return true;
    }

    getParams() {
        return {
            rates: this.rates,
            delay: this.delay,
            audio: this.audio,
            onlyWithPlayers: this.onlyWithPlayers,
            minimalPlayersNumber: this.minimalPlayersNumber,
        };
    }

    setParams(params) {
        const p = JSON.parse(JSON.stringify(params || {}));
        if (Array.isArray(p.rates)) {
            this.rates = p.rates;
        }
        if (p.audio !== undefined && p.audio !== null) {
            this.audio = !!p.audio;
        }
        if (typeof p.delay === 'number' && p.delay >= 0) {
            this.delay = p.delay;
        }
        if (typeof p.onlyWithPlayers === 'boolean') {
            this.onlyWithPlayers = p.onlyWithPlayers;
        }
        if (typeof p.minimalPlayersNumber === 'number' && !Number.isNaN(p.minimalPlayersNumber)) {
            this.minimalPlayersNumber = p.minimalPlayersNumber;
        }

        storage.setItem('competition_delay', this.delay);
        storage.setItem('competition_rates', this.rates);
        storage.setItem('competition_audio', this.audio);
        storage.setItem('competition_onlyWithPlayers', this.onlyWithPlayers);
        storage.setItem('competition_minimalPlayersNumber', this.minimalPlayersNumber);

        this._updateNotifications();
    }

    _updateNotifications() {
        for (const id in this._hash) {
            const competition = this._hash[id];
            if (competition.notification) {
                competition.notification.revoke();
            }
            if (competition.beginTime !== null) {
                this._notify(id);
            }
        }
    }

    /** Fetches the number of active players in the competition with their logins. */
    async _fetchPlayersData(competition) {
        const data = await request({ url: GAMELIST_DATA_URL, contentType: 'json' });
        if (!Array.isArray(data.gamelist)) {
            throw new Error('Competitions: data.gamelist not found.');
        }
        const found = data.gamelist.find((game) => game.id === competition.id);
        if (!found) {
            throw new Error('Competitions: competition #' + competition.id + ' not found.');
        }
        if (!Array.isArray(found.players)) {
            throw new Error('Competitions: players array not available.');
        }
        const active = found.players.filter((player) => !player.leave);
        return {
            number: active.length,
            logins: active.map((player) => player.name || ''),
        };
    }

    /**
     * @param {CompetitionData} competition
     * @param {number} remainingTime Seconds before the competition start.
     * @returns {DeferredNotification}
     */
    _createNotification(competition, remainingTime) {
        const showDelay = Math.max(remainingTime - this.delay, 0);
        const notification = new DeferredNotification(competition.id, {
            title: 'Соревнование',
            message: 'Соревнование x' + competition.ratingValue + ' начинается',
            iconUrl: '/res/comp_btn.png',
            audioUrl: this.audio ? '/res/competition.ogg' : undefined,
        });

        notification.before = async () => {
            if (await app.tabs.hasGameTab(competition.id)) {
                return false;
            }
            if (!this.onlyWithPlayers) {
                return true;
            }
            const data = await this._fetchPlayersData(competition);
            notification.options.message += data.number === 0
                ? '\n(Нет активных участников)'
                : '\nУчастники (' + data.number + '): ' + data.logins.join(', ');
            return this.minimalPlayersNumber <= data.number;
        };
        notification.show(showDelay);
        return notification;
    }

    /**
     * @param {(string|number)} beginTime ISO 8601 string or a unix timestamp.
     * @returns {number} Remaining time in seconds.
     */
    getRemainingTime(beginTime) {
        let beginTimestamp;
        if (typeof beginTime === 'string') {
            beginTimestamp = new Date(beginTime).getTime();
        } else if (typeof beginTime === 'number') {
            beginTimestamp = beginTime * 1000;
        }
        if (beginTimestamp === undefined) {
            throw new TypeError('Wrong argument type for getRemainingTime() method');
        }
        if (typeof this._timeCorrection !== 'number') {
            throw new Error('Server time delta is not set');
        }
        const remaining = beginTimestamp - (Date.now() + this._timeCorrection);
        return remaining > 0 ? Math.round(remaining / 1000) : 0;
    }

    _clearStarted() {
        for (const id in this._hash) {
            const beginTime = this._hash[id].beginTime;
            if (beginTime !== null && this.getRemainingTime(beginTime) === 0) {
                delete this._hash[id];
            }
        }
    }

    _clearAll() {
        for (const id in this._hash) {
            const competition = this._hash[id];
            if (competition.notification) {
                competition.notification.revoke();
            }
            delete this._hash[id];
        }
    }

    _notify(id) {
        const competition = this._hash[id];
        const remainingTime = this.getRemainingTime(competition.beginTime);
        if (this.delay > 0 && remainingTime > 0 && this.rates.indexOf(competition.ratingValue) !== -1) {
            competition.notification = this._createNotification(competition, remainingTime);
        }
    }

    teardown() {
        super.teardown();
        this._clearAll();
    }

    /** @abstract */
    _init() {}
}

export class CompetitionsWS extends Competitions {
    _processUpdated(game) {
        if (!this._hash[game.g]) {
            return;
        }
        if (game.diff && game.diff.begintime) {
            this._hash[game.g].beginTime = game.diff.begintime;
            this._notify(game.g);
        }
    }

    _processCreated(game) {
        if (!game.params || !game.params.competition) {
            return;
        }
        this._hash[game.id] = {
            id: game.id,
            ratingValue: game.params.regular_competition || 1,
            beginTime: game.begintime,
        };
        if (game.begintime !== null) {
            this._notify(game.id);
        }
        this._clearStarted();
    }

    _processInitList(list) {
        list.forEach((game) => {
            if (game && typeof game.info === 'object') {
                this._processCreated(game.info);
            }
        });
    }

    _init() {
        this.addMessageListener('AuthStateChanged', (event) => {
            this._clearAll();
            if (event.data.id) {
                this.setMessageListener('SocketConnected', () => {
                    bus.emit('SocketSubscribe', {
                        'gamelist/initList': (data) => this._processInitList(data),
                        'gamelist/gameCreated': (data) => this._processCreated(data),
                        'gamelist/gameUpdated': (data) => this._processUpdated(data),
                    });
                });
                this.setMessageListener('ServerTimeDelta', (e) => {
                    this._timeCorrection = e.data;
                });
            }
        });
    }
}

export class CompetitionsXHR extends Competitions {
    setParams(params) {
        super.setParams(params);
        this._check();
    }

    _processCompetition(competition) {
        if (this._hash[competition.id]) {
            return false;
        }
        this._hash[competition.id] = {
            id: competition.id,
            ratingValue: competition.params.regular_competition || 1,
            beginTime: competition.begintime,
        };
        this._notify(competition.id);
        this._clearStarted();

        const remainingTime = this.getRemainingTime(competition.begintime);
        if (remainingTime > 0 && (!this._lastTimeout || remainingTime < this._lastTimeout)) {
            this._lastTimeout = remainingTime;
            scheduleAlarm(ALARMS.COMPETITIONS_POLL, remainingTime + 120);
            return true;
        }
        return false;
    }

    _processGamelist(gamelist) {
        this._lastTimeout = null;
        const found = gamelist.some((game) => game.params && game.params.competition
            && this._processCompetition(game));
        if (!found) {
            scheduleAlarm(ALARMS.COMPETITIONS_POLL, 120);
        }
    }

    async _check() {
        try {
            const data = await this._fetchData();
            this._timeCorrection = (data.time - Math.round(Date.now() / 1000)) * 1000;
            this._processGamelist(data.gamelist);
        } catch (error) {
            console.log('KlavoTools: error while fetching gamelist data: ' + error);
            scheduleAlarm(ALARMS.COMPETITIONS_POLL, 30);
        }
    }

    async _fetchData() {
        const data = await request({
            url: GAMELIST_DATA_URL,
            method: 'POST',
            params: { cached_users: 0 },
            contentType: 'json',
        });
        if (!data || !Array.isArray(data.gamelist)) {
            throw new Error('Gamelist data not available');
        }
        return data;
    }

    teardown() {
        super.teardown();
        onAlarm(ALARMS.COMPETITIONS_POLL, () => {});
        chrome.alarms.clear(ALARMS.COMPETITIONS_POLL);
    }

    _init() {
        onAlarm(ALARMS.COMPETITIONS_POLL, () => this._check());
        this.addMessageListener('AuthStateChanged', (event) => {
            this._clearAll();
            chrome.alarms.clear(ALARMS.COMPETITIONS_POLL);
            if (event.data.id) {
                this._check();
            }
        });
    }
}
