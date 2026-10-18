import { type EngineName } from './engines.js';
/** Directory of this package, whether the file running is `src` or `dist`. */
export declare function packageRoot(): string;
/**
 * Absolute path of an engine's `dist/index.js`.
 * Node cannot resolve a package from a script written under `/tmp`, so the
 * runtime imports this file by URL. A missing install falls back to the sibling folder.
 */
export declare function engineEntry(name: EngineName): string;
/** `file:` URL of that engine entry. */
export declare function engineFileUrl(name: EngineName): string;
/**
 * The script-tag build, `browser/emoji-engine-2d.js` and its siblings.
 * Prefer the copy next to the resolved package, then the sibling folder.
 */
export declare function engineBrowserFile(name: EngineName): string;
