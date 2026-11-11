/**
 * @file In-process event bus for background modules
 * (replaces kango.addMessageListener / kango.dispatchMessage).
 *
 * Listeners receive an event object `{ name, data }`, like kango did.
 */

const listeners = new Map();

export const bus = {
    on(name, listener) {
        if (!listeners.has(name)) {
            listeners.set(name, new Set());
        }
        listeners.get(name).add(listener);
        return listener;
    },

    off(name, listener) {
        const set = listeners.get(name);
        if (set) {
            set.delete(listener);
        }
    },

    emit(name, data) {
        const set = listeners.get(name);
        if (!set) {
            return;
        }
        // Copy, so listeners may (un)subscribe while being called:
        for (const listener of Array.from(set)) {
            try {
                listener({ name, data });
            } catch (error) {
                console.error('KlavoTools: listener of "' + name + '" failed', error);
            }
        }
    },
};

/**
 * A base class for modules which can be torn down (all their bus listeners removed).
 * Replaces MutableModule.
 */
export class MutableModule {
    constructor() {
        this._subscriptions = [];
    }

    addMessageListener(name, listener) {
        this._subscriptions.push({ name, listener });
        bus.on(name, listener);
    }

    /** Sets the only listener of this module for the event, replacing an existing one. */
    setMessageListener(name, listener) {
        const found = this._subscriptions.find((item) => item.name === name);
        if (found) {
            bus.off(found.name, found.listener);
            this._subscriptions.splice(this._subscriptions.indexOf(found), 1);
        }
        this.addMessageListener(name, listener);
    }

    teardown() {
        for (const { name, listener } of this._subscriptions) {
            bus.off(name, listener);
        }
        this._subscriptions = [];
    }
}
