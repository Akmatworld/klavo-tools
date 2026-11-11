/**
 * @file User styles (skins) for the site.
 */
import { storage } from './storage.js';

export const SKINS = ['beige', 'pink', 'green', 'blue', 'violet', 'gray', 'nikitakozin'];

export class Skin {
    constructor() {
        this.list = SKINS.slice();
        this.active = storage.getItem('skin') || 'beige';
    }

    setActive(skin) {
        this.active = this.list.indexOf(skin) !== -1 ? skin : 'beige';
        storage.setItem('skin', this.active);
    }

    getActive() {
        return this.active;
    }

    getAll() {
        return this.list;
    }
}
