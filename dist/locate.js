import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENGINES } from './engines.js';
import { MagicError } from './error.js';
/** Directory of this package, whether the file running is `src` or `dist`. */
export function packageRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
/**
 * Absolute path of an engine's `dist/index.js`.
 * Node cannot resolve a package from a script written under `/tmp`, so the
 * runtime imports this file by URL. A missing install falls back to the sibling folder.
 */
export function engineEntry(name) {
    const pkg = ENGINES[name].package;
    try {
        const require = createRequire(path.join(packageRoot(), 'package.json'));
        return require.resolve(pkg);
    }
    catch {
        const fallback = path.resolve(packageRoot(), '..', pkg, 'dist', 'index.js');
        if (fs.existsSync(fallback))
            return fallback;
        throw new MagicError(`cannot find ${pkg}. Install it next to emoji-engine-magic.`);
    }
}
/** `file:` URL of that engine entry. */
export function engineFileUrl(name) {
    return pathToFileURL(engineEntry(name)).href;
}
/**
 * The script-tag build, `browser/emoji-engine-2d.js` and its siblings.
 * Prefer the copy next to the resolved package, then the sibling folder.
 */
export function engineBrowserFile(name) {
    const info = ENGINES[name];
    const candidates = [];
    try {
        candidates.push(path.resolve(path.dirname(engineEntry(name)), '..', 'browser', info.file));
    }
    catch {
        // engineEntry already explains a missing package. The sibling path is the second chance.
    }
    candidates.push(path.resolve(packageRoot(), '..', info.package, 'browser', info.file));
    for (const file of candidates) {
        if (fs.existsSync(file))
            return file;
    }
    throw new MagicError(`cannot find browser/${info.file}. Run npm run build in ${info.package}.`);
}
//# sourceMappingURL=locate.js.map