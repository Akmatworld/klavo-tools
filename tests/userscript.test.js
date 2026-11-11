import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import {
    includeToRegExpSource,
    matchesUrl,
    normalizeConfigEntry,
    parseMetadata,
    wrapUserscript,
} from '../src/shared/userscript.js';

const HEADER = `// ==UserScript==
// @name          Test
// @version       1.2.3
// @include       http*://klavogonki.ru/g/*
// @match         https://klavogonki.ru/forum/?page=1
// @run-at        document-start
// ==/UserScript==
`;

test('includeToRegExpSource converts globs and keeps /regexp/ values', () => {
    assert.equal(includeToRegExpSource('http*://klavogonki.ru/*'), 'http.*://klavogonki\\.ru/.*');
    assert.equal(includeToRegExpSource('/^https?:\\/\\/klavogonki/'), '^https?:\\/\\/klavogonki');
    assert.equal(includeToRegExpSource('https://a.ru/?x'), 'https://a\\.ru/\\?x');
});

test('parseMetadata reads includes, run-at and version', () => {
    const meta = parseMetadata(HEADER + 'alert(1)');
    assert.equal(meta.runAt, 'document_start');
    assert.equal(meta.version, '1.2.3');
    assert.equal(meta.includes.length, 2);
    assert.ok(matchesUrl(meta, 'https://klavogonki.ru/g/?gmid=1'));
    assert.ok(matchesUrl(meta, 'http://klavogonki.ru/g/?gmid=1'));
    assert.ok(matchesUrl(meta, 'https://klavogonki.ru/forum/?page=1'));
    assert.ok(!matchesUrl(meta, 'https://klavogonki.ru/gamelist/'));
});

test('parseMetadata defaults to document_end and ignores rules after the header', () => {
    const meta = parseMetadata('// ==UserScript==\n// ==/UserScript==\n// @include *\n// @run-at document-start');
    assert.equal(meta.runAt, 'document_end');
    assert.deepEqual(meta.includes, []);
});

function runWrapped(code, url, readyState = 'loading') {
    const calls = [];
    const listeners = {};
    const context = {
        location: { href: url },
        document: { readyState, head: { appendChild: (el) => calls.push(['style', el.textContent]) },
            createElement: () => ({}) },
        window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
        console: { log: (...args) => calls.push(['log', args[2] && args[2].message]) },
        mark: (value) => calls.push(['mark', value]),
    };
    vm.runInNewContext(code, context);
    return { calls, listeners };
}

test('wrapped script runs only on matching URLs', () => {
    const code = wrapUserscript('Test', HEADER + 'mark("ran");');
    assert.deepEqual(runWrapped(code, 'https://klavogonki.ru/g/?gmid=5').calls, [['mark', 'ran']]);
    assert.deepEqual(runWrapped(code, 'https://klavogonki.ru/top/').calls, []);
});

test('wrapped script catches errors and provides GM_addStyle', () => {
    const code = wrapUserscript('Test', HEADER + 'GM_addStyle("a{}"); throw new Error("boom");');
    assert.deepEqual(runWrapped(code, 'https://klavogonki.ru/g/').calls, [['style', 'a{}'], ['log', 'boom']]);
});

test('document_idle scripts wait for the load event', () => {
    const code = wrapUserscript('Idle', HEADER.replace('document-start', 'document-idle') + 'mark("idle");');
    const pending = runWrapped(code, 'https://klavogonki.ru/g/', 'interactive');
    assert.deepEqual(pending.calls, []);
    pending.listeners.load();
    assert.deepEqual(pending.calls, [['mark', 'idle']]);
    assert.deepEqual(runWrapped(code, 'https://klavogonki.ru/g/', 'complete').calls, [['mark', 'idle']]);
});

test('a script ending with a line comment is still wrapped correctly', () => {
    const code = wrapUserscript('Comment', HEADER + 'mark("ok"); // trailing comment');
    assert.deepEqual(runWrapped(code, 'https://klavogonki.ru/g/').calls, [['mark', 'ok']]);
});

test('normalizeConfigEntry fills defaults', () => {
    assert.deepEqual(normalizeConfigEntry({ name: 'X', version: '1.0.0' }), {
        name: 'X', version: '1.0.0', authors: [], tags: [], description: '',
        broken: false, integrated: false, disabled: false, conflicts: [],
    });
});

test('every bundled KgScripts userscript parses and compiles after wrapping', async () => {
    const dir = new URL('../vendor/KgScripts/scripts/', import.meta.url);
    const config = JSON.parse(await readFile(new URL('../vendor/KgScripts/klavotools.json', import.meta.url), 'utf8'));
    const files = new Set(await readdir(dir));
    // Intentionally not bundled (see scripts/sync-userscripts.mjs):
    const excluded = new Set(['KG_YandexTranslator']);
    for (const entry of config) {
        const file = entry.name + '.user.js';
        if (excluded.has(entry.name)) {
            assert.ok(!files.has(file), file + ' must not be bundled');
            continue;
        }
        assert.ok(files.has(file), 'missing ' + file);
        const code = await readFile(new URL(file, dir), 'utf8');
        const meta = parseMetadata(code);
        assert.ok(meta.includes.length > 0, entry.name + ' has no @include/@match');
        // Throws a SyntaxError if the wrapper broke the code:
        new vm.Script(wrapUserscript(entry.name, code, meta), { filename: file });
    }
});
