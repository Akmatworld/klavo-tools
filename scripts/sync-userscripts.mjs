#!/usr/bin/env node
/**
 * Updates the bundled snapshot of https://github.com/voidmain02/KgScripts
 * in vendor/KgScripts (used when the userScripts API is not available).
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor', 'KgScripts');
const REPO = 'https://raw.githubusercontent.com/voidmain02/KgScripts/master';

// Not bundled: contains an (obsolete) Yandex API key, which GitHub push protection
// rejects; the script is marked broken upstream anyway. It is still available in
// the "remote" mode, which downloads scripts directly from KgScripts.
const EXCLUDE = new Set(['KG_YandexTranslator']);

async function get(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' for ' + url);
    }
    return response.text();
}

const configText = await get(REPO + '/klavotools.json');
const config = JSON.parse(configText);
const scriptsDir = path.join(VENDOR, 'scripts');
await mkdir(scriptsDir, { recursive: true });

const wanted = new Set();
for (const entry of config) {
    if (EXCLUDE.has(entry.name)) {
        console.log('  skipped ' + entry.name);
        continue;
    }
    const file = entry.name + '.user.js';
    wanted.add(file);
    await writeFile(path.join(scriptsDir, file), await get(REPO + '/scripts/' + encodeURIComponent(entry.name) + '.user.js'));
    console.log('  ' + entry.name + ' ' + entry.version);
}
for (const file of await readdir(scriptsDir)) {
    if (!wanted.has(file)) {
        await rm(path.join(scriptsDir, file));
        console.log('  removed ' + file);
    }
}
await writeFile(path.join(VENDOR, 'klavotools.json'), configText);
console.log(`✓ ${config.length} userscripts in vendor/KgScripts`);
