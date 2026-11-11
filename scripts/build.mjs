#!/usr/bin/env node
/**
 * Builds the extension into dist/<target> (chrome, firefox).
 *
 *   node scripts/build.mjs                  # both targets
 *   node scripts/build.mjs --target=chrome  # one target
 *   node scripts/build.mjs --zip            # also pack dist/<target>.zip
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import { normalizeConfigEntry, parseMetadata, wrapUserscript } from '../src/shared/userscript.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const VENDOR = path.join(ROOT, 'vendor', 'KgScripts');

// Own add-on id: the original klavotools-kango@klavogonki.ru belongs to the
// kango-based extension on addons.mozilla.org.
const GECKO_ID = 'klavotools@akmatworld';

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith('--target='));
const targets = targetArg ? [targetArg.split('=')[1]] : ['chrome', 'firefox'];
const zip = args.includes('--zip');

for (const target of targets) {
    if (!['chrome', 'firefox'].includes(target)) {
        throw new Error('Unknown target: ' + target);
    }
}

/** Files from src/ which are not copied as is. */
function shouldCopy(source) {
    const rel = path.relative(SRC, source);
    if (rel === 'manifest.json') return false;
    if (rel.endsWith('.scss')) return false;
    // SCSS partials and the CSS files they import:
    if (rel === path.join('res', 'skins') || rel === path.join('res', 'popup')) return false;
    if (path.basename(rel) === '.DS_Store') return false;
    return true;
}

function compileStyles(outDir) {
    const entries = [
        ['res/popup.scss', 'res/popup.css'],
        ['res/skins.scss', 'res/skins.css'],
    ];
    return Promise.all(entries.map(([from, to]) => {
        const result = sass.compile(path.join(SRC, from), { style: 'compressed' });
        return writeFile(path.join(outDir, to), result.css);
    }));
}

async function buildUserscripts(outDir) {
    const config = JSON.parse(await readFile(path.join(VENDOR, 'klavotools.json'), 'utf8'));
    const scriptsDir = path.join(outDir, 'userscripts');
    await mkdir(path.join(scriptsDir, 'raw'), { recursive: true });

    const index = [];
    for (const raw of config) {
        const entry = normalizeConfigEntry(raw);
        const sourcePath = path.join(VENDOR, 'scripts', entry.name + '.user.js');
        if (!existsSync(sourcePath)) {
            // Excluded from the snapshot (see scripts/sync-userscripts.mjs); available in the remote mode.
            console.log('  - not bundled: ' + entry.name);
            continue;
        }
        const code = await readFile(sourcePath, 'utf8');
        const meta = parseMetadata(code);
        const file = 'userscripts/' + entry.name + '.js';
        // Plain text: these are only read as the source code, never executed directly.
        const rawFile = 'userscripts/raw/' + entry.name + '.user.txt';
        await writeFile(path.join(outDir, file), wrapUserscript(entry.name, code, meta));
        await writeFile(path.join(outDir, rawFile), code);
        index.push(Object.assign(entry, { file, raw: rawFile, runAt: meta.runAt }));
    }
    await writeFile(path.join(scriptsDir, 'index.json'), JSON.stringify(index, null, 2));
    return index.length;
}

async function buildManifest(target) {
    const manifest = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    manifest.version = pkg.version;

    if (target === 'chrome') {
        manifest.minimum_chrome_version = '120';
        manifest.background = { service_worker: 'background/index.js', type: 'module' };
        manifest.permissions.push('offscreen', 'userScripts');
    } else {
        manifest.background = { scripts: ['background/index.js'], type: 'module' };
        // Firefox grants userScripts only as an optional permission:
        manifest.optional_permissions = ['userScripts'];
        manifest.browser_specific_settings = {
            gecko: {
                id: GECKO_ID,
                strict_min_version: '128.0',
                // Required by AMO for new add-ons; the extension collects no data.
                // Ignored by Firefox versions before 140.
                data_collection_permissions: {
                    required: ['none'],
                },
            },
        };
    }
    manifest.permissions.sort();
    return manifest;
}

async function build(target) {
    const outDir = path.join(DIST, target);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    await cp(SRC, outDir, { recursive: true, filter: shouldCopy });
    if (target === 'firefox') {
        // Firefox background pages can play audio themselves:
        await rm(path.join(outDir, 'offscreen'), { recursive: true, force: true });
    }
    await compileStyles(outDir);
    const count = await buildUserscripts(outDir);
    const manifest = await buildManifest(target);
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    console.log(`✓ ${target}: dist/${target} (v${manifest.version}, ${count} bundled userscripts)`);

    if (zip) {
        const archive = path.join(DIST, `klavotools-${target}-${manifest.version}.zip`);
        await rm(archive, { force: true });
        execFileSync('zip', ['-qr', '-X', archive, '.'], { cwd: outDir });
        console.log(`  packed ${path.relative(ROOT, archive)}`);
    }
}

for (const target of targets) {
    await build(target);
}

// Make sure nothing from kango survived:
async function assertNoKango(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'userscripts') await assertNoKango(full);
        } else if (/\.(js|html)$/.test(entry.name) && entry.name !== 'angular.min.js') {
            const text = (await readFile(full, 'utf8'))
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            if (/\bkango\b|KangoAPI|kango-ui/i.test(text)) {
                throw new Error('kango reference left in ' + path.relative(ROOT, full));
            }
        }
    }
}
for (const target of targets) {
    await assertNoKango(path.join(DIST, target));
}
