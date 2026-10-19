export { App } from './app.js';
export type { PackOptions, PackResult } from './app.js';

export { bundle } from './bundle.js';
export type { BundleOptions, BundleResult } from './bundle.js';

export { checkProgram, fileIsStrict } from './check.js';
export { Compiler, compile, defaultResolve } from './compiler.js';
export type { BodyBinding, BodyOptions, BodyResult, CompileOptions, CompileResult, CompiledImport } from './compiler.js';

export { MagicError } from './error.js';
export { Lexer } from './lexer.js';
export { Parser } from './parser.js';

export { Runtime } from './runtime.js';
export type { MagicModule, RuntimeOptions } from './runtime.js';
