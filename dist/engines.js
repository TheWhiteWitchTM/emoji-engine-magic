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
        if (/\.(js|mjs|cjs|json)$/.test(specifier))
            return false;
        return true;
    }
    return false;
}
//# sourceMappingURL=engines.js.map