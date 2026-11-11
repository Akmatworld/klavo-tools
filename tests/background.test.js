import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Protocol } from '../src/background/protocol.js';
import { flattenMenu, makeRedirectURL, parseLinkURL, USER_MENU, VOC_MENU } from '../src/background/context-menus.js';
import { bus, MutableModule } from '../src/background/bus.js';

function protocolWith(config) {
    const protocol = new Protocol();
    protocol.config = config;
    return protocol;
}

test('Protocol redirects to the configured protocol', () => {
    const https = protocolWith({ type: 'HTTPS', redirect: true });
    assert.equal(https.redirect('http://klavogonki.ru/gamelist/'), 'https://klavogonki.ru/gamelist/');
    assert.equal(https.redirect('https://klavogonki.ru/gamelist/'), false);

    const http = protocolWith({ type: 'HTTP', redirect: true });
    assert.equal(http.redirect('https://klavogonki.ru/top/'), 'http://klavogonki.ru/top/');

    const noRedirect = protocolWith({ type: 'HTTPS', redirect: false });
    assert.equal(noRedirect.redirect('http://klavogonki.ru/top/'), false);
});

test('Protocol "prev" mode remembers the last used protocol', () => {
    const prev = protocolWith({ type: 'prev', redirect: true });
    prev.redirect('http://klavogonki.ru/');
    assert.equal(prev.convert('/g/?gmid=1'), 'http://klavogonki.ru/g/?gmid=1');
    prev.redirect('https://klavogonki.ru/');
    assert.equal(prev.convert('/g/?gmid=1'), 'https://klavogonki.ru/g/?gmid=1');
    assert.equal(prev.convert('https://example.com/x'), 'https://example.com/x');
});

test('Protocol default config is "prev" (the site works over HTTPS)', () => {
    assert.deepEqual(Protocol.defaultCfg, { type: 'prev', redirect: true });
});

test('Protocol.handleMessage answers protocol/* messages only', () => {
    const protocol = protocolWith({ type: 'HTTPS', redirect: true });
    assert.equal(protocol.handleMessage({ name: 'other' }), undefined);
    assert.deepEqual(protocol.handleMessage({ name: 'protocol/get' }), { protocol: 'https' });
    assert.deepEqual(protocol.handleMessage({ name: 'protocol/convert', url: '/top/' }),
        { url: 'https://klavogonki.ru/top/' });
});

test('context menu helpers substitute ids', () => {
    assert.deepEqual(parseLinkURL('https://klavogonki.ru/u/#/12345/'), { user_id: '12345' });
    assert.deepEqual(parseLinkURL('https://klavogonki.ru/profile/77'), { user_id: '77' });
    assert.deepEqual(parseLinkURL('https://klavogonki.ru/vocs/42/'), { voc_id: '42' });
    assert.deepEqual(parseLinkURL('https://klavogonki.ru/forum/'), {});
    assert.equal(makeRedirectURL('/u/#/{auth_id}/messages/{user_id}', 'https://klavogonki.ru/u/#/5/', 9),
        '/u/#/9/messages/5');
});

test('context menus get unique deterministic ids with submenus', () => {
    const items = [...flattenMenu(USER_MENU), ...flattenMenu(VOC_MENU)];
    const ids = items.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    const play = items.find((item) => item.title === 'Играть');
    const children = items.filter((item) => item.parentId === play.id);
    assert.equal(children.length, 5);
    assert.equal(items.find((item) => item.title === 'Открыть диалог').authorized, true);
});

test('MutableModule teardown removes its bus listeners', () => {
    const module = new MutableModule();
    const calls = [];
    module.addMessageListener('E', (event) => calls.push(['a', event.data]));
    module.setMessageListener('E', (event) => calls.push(['b', event.data]));
    bus.emit('E', 1);
    module.teardown();
    bus.emit('E', 2);
    assert.deepEqual(calls, [['b', 1]]);
});
