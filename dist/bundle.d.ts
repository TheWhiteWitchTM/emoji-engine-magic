import { type EngineName } from './engines.js';
import { commonDir, moduleFile } from './graph.js';
export interface BundleOptions {
    /**
     * `module` is one ES module that imports the engines by package name.
     * `script` is one classic script that reads the engine globals.
     */
    target?: 'module' | 'script';
}
export interface BundleResult {
    code: string;
    /** Names the entry script declares. */
    exports: string[];
    /** Engines the script graph imports, in a stable order. */
    engines: EngineName[];
    /** Absolute paths of the Magic files, entry last. */
    files: string[];
}
/**
 * Compile a Magic file and every Magic file it imports into one JavaScript file.
 * Engine imports stay as package imports or as the browser globals.
 * Relative `.js` / `.json` files are imported or inlined.
 */
export declare function bundle(entry: string, options?: BundleOptions): BundleResult;
export { commonDir, moduleFile };
