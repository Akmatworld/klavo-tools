/**
 * @file A wrapper for the klavogonki.ru WebSocket (SockJS) connection.
 * @listens AuthStateChanged
 * @listens SocketSubscribe
 * @fires SocketConnected
 * @fires ServerTimeDelta
 * @fires SocketError
 */
import { bus, MutableModule } from './bus.js';
import { keepAlive } from './keepalive.js';
import { WS_BASE_URL } from './constants.js';

export class Socket extends MutableModule {
    constructor() {
        super();
        this._ws = null;
        this._authorized = false;
        this._listeners = {};
        this.addMessageListener('AuthStateChanged', (event) => {
            if (event.data.id) {
                this.connect(event.data.id, event.data.one_shot_hash)
                    .catch((error) => console.log('KlavoTools: WebSocket auth failed: ' + error));
            } else {
                this.disconnect();
            }
        });
    }

    /**
     * Starts a new WebSocket session.
     * @param {number} id The Me.id value.
     * @param {string} hash The Me.one_shot_hash value.
     * @returns {Promise.<string>} Resolves when the auth process is finished.
     */
    connect(id, hash) {
        if (!id || !hash) {
            return Promise.reject(new TypeError('The user id or disposable hash not specified.'));
        }
        this.disconnect();

        // SockJS URL: base/{server_id}/{session_id}/{transport}
        const serverId = Math.floor(Math.random() * 1e3);
        const sessionId = 'kts' + Math.floor(Math.random() * 1e5);
        const url = WS_BASE_URL + '/' + serverId + '/' + sessionId + '/websocket';

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            this._ws = ws;
            this._id = id;
            this._hash = hash;
            this._closedByClient = false;
            const deferred = { resolve, reject };
            ws.onopen = () => this._auth();
            ws.onerror = (event) => this._onError(ws, event);
            ws.onclose = (event) => this._onClose(ws, deferred, event);
            ws.onmessage = (event) => this._onMessage(deferred, event);
            keepAlive.acquire('socket');
        });
    }

    /** Removes all listeners and closes the current WebSocket session. */
    disconnect(code, reason) {
        this._listeners = {};
        this._authorized = false;
        keepAlive.release('socket');
        if (this._ws) {
            this._closedByClient = true;
            if (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING) {
                try {
                    this._ws.close(code, reason);
                } catch (error) {
                    this._ws.close();
                }
            }
            this._ws = null;
        }
    }

    _auth() {
        this._send('auth ' + this._id + ':' + this._hash);
    }

    _send(message) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify([message]));
        }
    }

    /**
     * SocketSubscribe handler: sends subscribe requests and saves callbacks.
     * @param {Object} event `event.data` is a hash (eventName → callback).
     */
    _subscribe(event) {
        if (!this._authorized) {
            return;
        }

        for (const eventName in event.data) {
            if (!this._listeners[eventName]) {
                this._listeners[eventName] = [event.data[eventName]];
                this._send('subscribe ' + eventName);
            } else {
                this._listeners[eventName].push(event.data[eventName]);
            }
        }
    }

    _onMessage(deferred, event) {
        if (typeof event.data !== 'string' || !event.data.length || event.data === 'o' || event.data === 'h') {
            return;
        }

        const messageType = event.data[0];
        let payload;
        try {
            payload = JSON.parse(event.data.slice(1));
        } catch (error) {
            console.log('KlavoTools: got bad JSON from WebSocket: ' + error);
            return;
        }

        if (messageType === 'a') {
            payload.forEach((message) => this._handleMessage(deferred, message));
        } else if (messageType === 'm') {
            this._handleMessage(deferred, payload);
        }
    }

    _handleMessage(deferred, message) {
        if (!this._authorized) {
            if (message === 'auth ok') {
                this._authorized = true;
                this.setMessageListener('SocketSubscribe', (event) => this._subscribe(event));
                bus.emit('SocketConnected', message);
                deferred.resolve(message);
            } else if (message === 'auth failed') {
                deferred.reject(message);
            } else {
                const match = typeof message === 'string' && message.match(/^time (\d+)$/);
                if (match) {
                    bus.emit('ServerTimeDelta', match[1] - Date.now());
                }
            }
            return;
        }

        let parsed = message;
        try {
            parsed = JSON.parse(message);
        } catch (error) {
            console.log('KlavoTools: got bad JSON from the site: "' + message + '" ' + error);
            return;
        }

        if (Array.isArray(parsed) && parsed.length === 2 && this._listeners[parsed[0]]) {
            for (const listener of this._listeners[parsed[0]]) {
                try {
                    listener(parsed[1]);
                } catch (error) {
                    console.error('KlavoTools: socket listener of "' + parsed[0] + '" failed', error);
                }
            }
        }
    }

    _onClose(ws, deferred, event) {
        if (ws !== this._ws && this._ws !== null) {
            // An old connection replaced by a newer one.
            return;
        }
        const wasAuthorized = this._authorized;
        if (!wasAuthorized) {
            deferred.reject(event.reason || 'closed');
        }
        if (!this._closedByClient) {
            console.log('KlavoTools: WebSocket closed: #' + event.code + ': ' + event.reason);
            this._ws = null;
            this.disconnect();
            if (wasAuthorized) {
                // The connection was lost: re-login, which reconnects the socket.
                bus.emit('SocketError', event);
            }
        }
    }

    _onError(ws, event) {
        if (ws !== this._ws) {
            return;
        }
        console.log('KlavoTools: a WebSocket error has occurred.');
        this.disconnect();
        bus.emit('SocketError', event);
    }

    teardown() {
        super.teardown();
        this.disconnect();
    }
}
