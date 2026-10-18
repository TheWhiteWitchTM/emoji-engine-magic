/** The three sibling engines Magic knows by a short name. */
export type EngineName = '2d' | '3d' | 'ui';
export interface EngineInfo {
    name: EngineName;
    /** Package name used in a compiled import. */
    package: string;
    /** Global set by that engine's browser build. */
    global: string;
    /** Browser bundle file name. */
    file: string;
}
export declare const ENGINES: Record<EngineName, EngineInfo>;
/** Short name or package name, or null when the specifier is not an engine. */
export declare function engineKey(specifier: string): EngineName | null;
/**
 * A Magic script import, as opposed to an engine or a plain JavaScript module.
 * `./witch` counts. `./notes.js` does not.
 */
export declare function isMagicSpecifier(specifier: string): boolean;
