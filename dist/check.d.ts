import type { Program } from './ast.js';
/**
 * True when this file opted into strict mode.
 * `@strict` turns it on. `@normal` turns it off. A later one wins.
 * `fallback` is the compiler option when the file says nothing.
 */
export declare function fileIsStrict(program: Program, fallback?: boolean): boolean;
/** Walk a parsed program and report the traps strict mode is here to catch. */
export declare function checkProgram(program: Program, filename: string, strict: boolean): void;
