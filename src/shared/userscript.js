/**
 * @file Userscript helpers shared between the background service worker and the
 * build script: metadata parsing and wrapping of a userscript source code into
 * a self-contained file, suitable for both the `userScripts` and `scripting` APIs.
 *
 * The module must stay free of any extension API usage, so it can be imported
 * from Node.js.
 */

const META_END = '==/UserScript==';
const RUN_AT_VALUES = ['document_start', 'document_end', 'document_idle'];

/**
 * Converts the @include/@match value into a RegExp source string.
 * Supports both glob-like values (`http*://klavogonki.ru/*`) and /regexp/ values.
 * @param {string} value
 * @returns {string}
 */
export function includeToRegExpSource(value) {
    if (value.length > 1 && value.startsWith('/') && value.endsWith('/')) {
        return value.slice(1, -1);
    }
    return value
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
}

/**
 * Parses the userscript metadata block.
 * @param {string} code The userscript source code.
 * @returns {{includes: string[], runAt: string, version: (string|null)}}
 *  `includes` is an array of RegExp source strings.
 */
export function parseMetadata(code) {
    const end = code.indexOf(META_END);
    const metadata = end === -1 ? '' : code.substring(0, end);

    const includes = [];
    const includesRE = /@(?:include|match)\s+(\S+)/g;
    let match;
    while ((match = includesRE.exec(metadata)) !== null) {
        includes.push(includeToRegExpSource(match[1]));
    }

    const runAtMatch = metadata.match(/@run-at\s+(\S+)/);
    let runAt = runAtMatch ? runAtMatch[1].replace(/-/g, '_') : 'document_end';
    if (RUN_AT_VALUES.indexOf(runAt) === -1) {
        runAt = 'document_end';
    }

    const versionMatch = metadata.match(/@version\s+(\S+)/);

    return {
        includes,
        runAt,
        version: versionMatch ? versionMatch[1] : null,
    };
}

/**
 * Checks whether the userscript with the given metadata should run on the URL.
 * @param {{includes: string[]}} meta
 * @param {string} url
 * @returns {boolean}
 */
export function matchesUrl(meta, url) {
    return meta.includes.some((source) => new RegExp(source).test(url));
}

/**
 * Wraps the userscript code into an IIFE which:
 *  - checks the page URL against the @include/@match rules;
 *  - provides a minimal GM_addStyle() implementation;
 *  - postpones `document_idle` scripts until the window `load` event
 *    (the behaviour of the original KlavoTools extension);
 *  - catches and logs synchronous errors.
 * @param {string} name The userscript name.
 * @param {string} code The userscript source code.
 * @param {{includes: string[], runAt: string}} [meta] Parsed metadata.
 * @returns {string}
 */
export function wrapUserscript(name, code, meta = parseMetadata(code)) {
    const waitForLoad = meta.runAt === 'document_idle';
    return [
        '(function () {',
        `var __ktsIncludes = ${JSON.stringify(meta.includes)};`,
        'var __ktsHref = location.href;',
        'if (!__ktsIncludes.some(function (s) { return new RegExp(s).test(__ktsHref); })) { return; }',
        'function GM_addStyle(css) {',
        '  var style = document.createElement("style");',
        '  style.textContent = css;',
        '  (document.head || document.documentElement).appendChild(style);',
        '  return style;',
        '}',
        'function __ktsRun() {',
        'try {',
        code,
        '} catch (error) {',
        `  console.log("KlavoTools: error in script ", ${JSON.stringify(name)}, error);`,
        '}',
        '}',
        waitForLoad
            ? 'if (document.readyState === "complete") { __ktsRun(); } else { window.addEventListener("load", __ktsRun); }'
            : '__ktsRun();',
        '})();',
        '',
    ].join('\n');
}

/**
 * Normalizes an entry of the KgScripts `klavotools.json` config.
 * @param {Object} entry
 * @returns {Object}
 */
export function normalizeConfigEntry(entry) {
    return {
        name: entry.name,
        version: entry.version,
        authors: Array.isArray(entry.authors) ? entry.authors : [],
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        description: entry.description || '',
        broken: !!entry.broken,
        integrated: !!entry.integrated,
        disabled: !!entry.disabled,
        conflicts: Array.isArray(entry.conflicts) ? entry.conflicts : [],
    };
}
