import type { ImportStmt, Program } from './ast.js';
import { type EngineName } from './engines.js';
export interface CompileOptions {
    /** Shown in errors and in the comment at the top of the JavaScript. */
    filename?: string;
    /**
     * `module` writes an ES module that imports the engines.
     * `script` writes one IIFE that reads the engine globals. It cannot import other Magic files.
     */
    target?: 'module' | 'script';
    /** Rewrites an import specifier. The default keeps engine package names and turns `.magic` into `.js`. */
    resolve?: (specifier: string) => string;
    /** Prelude import path for `module`. Default `./magic-std.js`. */
    prelude?: string;
}
export interface CompiledImport {
    specifier: string;
    resolved: string;
    kind: 'engine' | 'magic' | 'js';
    engine: EngineName | null;
    form: ImportStmt['form'];
    alias: string | null;
    names: {
        imported: string;
        local: string;
    }[];
}
export interface CompileResult {
    code: string;
    exports: string[];
    imports: CompiledImport[];
}
export interface BodyBinding {
    local: string;
    expr: string;
}
export interface BodyOptions {
    filename?: string;
    /** Import locals already available, as JavaScript expressions. */
    bindings: BodyBinding[];
}
export interface BodyResult {
    code: string;
    exports: string[];
}
/**
 * Compiles one Magic script to JavaScript.
 * Application code can call `compile`. A bundle calls `emitBody` once per file.
 */
export declare class Compiler {
    private w;
    private filename;
    private esm;
    private bindings;
    private scope;
    private readonly scopes;
    private readonly root;
    private selfExpr;
    private superName;
    private allowSuper;
    private loop;
    private fnDepth;
    private canAwait;
    private temps;
    private readonly readyClasses;
    compile(source: string, options?: CompileOptions): CompileResult;
    compileProgram(program: Program, options?: CompileOptions): CompileResult;
    /** True when the file awaits at the top level, so a script wrapper has to be async. */
    hasTopLevelAwait(program: Program): boolean;
    /** Statements for one file inside a bundle. The caller wraps them in a function. */
    emitBody(program: Program, options: BodyOptions): BodyResult;
    private compileModule;
    private compileScript;
    private header;
    private emitModuleImports;
    private scriptBindings;
    private checkBindings;
    private emitMain;
    private emitHoist;
    private exportNames;
    private programKey;
    private emitStmt;
    private emitTry;
    private emitIf;
    private emitFor;
    private emitLoop;
    private emitAssign;
    private emitFn;
    private emitClass;
    private emitInit;
    private emitMethod;
    private emitFnBody;
    private emitAnon;
    private expr;
    private binary;
    private superCall;
    private prop;
    private callee;
    private ref;
    private assignable;
    private selfRef;
    private analyze;
    private analyzeBody;
    private scanSurface;
    private scanStmt;
    private scanAssign;
    private scanNested;
    private nestStmt;
    private analyzeFunction;
    private nestExpr;
    private declare;
    private lookup;
    private lookupFrom;
    private child;
    private needScope;
    private saveFlags;
    private restoreFlags;
    private hasTopAwait;
    private stmtHasTopAwait;
    private exprHasTopAwait;
    private temp;
    private reset;
    private oops;
}
/** Compile one Magic script. */
export declare function compile(source: string, options?: CompileOptions): CompileResult;
export declare function defaultResolve(specifier: string): string;
