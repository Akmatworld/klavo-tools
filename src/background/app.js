/**
 * @file Shared application context (the former global `KlavoTools` object) and
 * the alarm registry.
 *
 * Modules access each other through `app` lazily (at call time), so the import
 * order doesn't matter.
 */
export const app = {};

const alarmHandlers = new Map();

/** Registers a handler for a chrome.alarms alarm name. */
export function onAlarm(name, handler) {
    alarmHandlers.set(name, handler);
}

/** Dispatches chrome.alarms.onAlarm (the listener is set up in index.js). */
export function dispatchAlarm(alarm) {
    const handler = alarmHandlers.get(alarm.name);
    if (handler) {
        handler(alarm);
    }
}

/**
 * Schedules a one-shot alarm. Chrome requires at least 30 seconds for alarms.
 * @param {string} name
 * @param {number} seconds
 */
export function scheduleAlarm(name, seconds) {
    const delayInMinutes = Math.max(seconds, 30) / 60;
    return chrome.alarms.create(name, { delayInMinutes });
}
