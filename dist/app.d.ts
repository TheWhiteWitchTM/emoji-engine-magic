import { type EngineName } from './engines.js';
export interface PackOptions {
    /** Folder to write. Default is `build/<name>` in the current directory. */
    out?: string;
    /** Package name. Default is the script's file name. */
    name?: string;
    /** Window title. Default is the package name. */
    title?: string;
    /** Window width in pixels. Default 960. */
    width?: number;
    /** Window height in pixels. Default 720. */
    height?: number;
}
export interface PackResult {
    dir: string;
    engines: EngineName[];
}
/**
 * Turns one Magic script into an Electron project.
 * It copies the browser builds the script actually imports.
 * It does not download Electron. The project README says how to start it.
 */
export declare class App {
    static pack(entry: string, options?: PackOptions): PackResult;
}
