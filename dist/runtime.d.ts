export interface RuntimeOptions {
    /** Directory relative script names start from. Default is the current directory. */
    root?: string;
    /** Where generated modules are written. Default is a fresh folder under the system temp directory. */
    outDir?: string;
    /** Check every file as `@strict` unless that file writes `@normal`. */
    strict?: boolean;
}
/** The exports of the script that just ran. */
export type MagicModule = Record<string, unknown>;
/**
 * Runs Magic on Node.
 * Each run writes a new folder of ES modules and imports the entry.
 * A new folder matters: Node caches a module by its URL.
 */
export declare class Runtime {
    readonly root: string;
    readonly outDir: string;
    readonly strict: boolean;
    constructor(options?: RuntimeOptions);
    /** Read `file` and the Magic files it imports, then run the entry. */
    runFile(file: string): Promise<MagicModule>;
    /**
     * Run source that may not be on disk.
     * `filename` is the name errors use, and the folder imports are resolved from.
     */
    run(source: string, filename?: string): Promise<MagicModule>;
    private execute;
    private resolve;
    /** Real ESM is imported in place. JSON and classic scripts become a sibling module. */
    private jsSpecifier;
    private loadHook;
}
