export const ENGINES = {
    '2d': {
        name: '2d',
        package: 'emoji-engine-2d',
        global: 'EmojiEngine',
        file: 'emoji-engine-2d.js',
    },
    '3d': {
        name: '3d',
        package: 'emoji-engine-3d',
        global: 'EmojiEngine3D',
        file: 'emoji-engine-3d.js',
    },
    ui: {
        name: 'ui',
        package: 'emoji-engine-ui',
        global: 'EmojiEngineUI',
        file: 'emoji-engine-ui.js',
    },
};
const ALIASES = {
    '2d': '2d',
    'emoji-engine-2d': '2d',
    '3d': '3d',
    'emoji-engine-3d': '3d',
    ui: 'ui',
    'emoji-engine-ui': 'ui',
};
/** Short name or package name, or null when the specifier is not an engine. */
export function engineKey(specifier) {
    return ALIASES[specifier] ?? null;
}
const JS_EXT = /\.(js|mjs|cjs|json)$/i;
/**
 * A Magic script import, as opposed to an engine or a plain JavaScript module.
 * `./witch` counts. `./notes.js` does not.
 */
export function isMagicSpecifier(specifier) {
    if (engineKey(specifier))
        return false;
    if (specifier.endsWith('.magic'))
        return true;
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        if (JS_EXT.test(specifier))
            return false;
        return true;
    }
    return false;
}
/** A JavaScript or JSON module. Package names are included when they end in those extensions. */
export function isJsSpecifier(specifier) {
    if (engineKey(specifier))
        return false;
    return JS_EXT.test(specifier);
}
/**
 * A JS or JSON file next to the importer.
 * `./math.js` counts. `lodash` does not. `pkg/index.js` is left to the package resolver.
 */
export function isRelativeJsSpecifier(specifier) {
    if (!isJsSpecifier(specifier))
        return false;
    return specifier.startsWith('./') || specifier.startsWith('../');
}
//# sourceMappingURL=engines.js.map