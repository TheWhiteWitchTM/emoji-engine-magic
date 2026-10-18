export type JsKind = 'esm' | 'cjs' | 'json';
/** `./math.js` next to the Magic file that imported it. */
export declare function resolveJsFile(fromFile: string, specifier: string): string;
export declare function classifyJs(file: string, source: string): JsKind;
export declare function readJsFile(absPath: string): {
    kind: JsKind;
    source: string;
};
/**
 * Turn JSON, classic scripts, and CommonJS into an ES module text.
 * Real ESM is left as it was written.
 */
export declare function toEsmSource(absPath: string, source: string, kind: JsKind): string;
/** An IIFE that evaluates JSON or classic JS and returns a namespace object. */
export declare function toNamespaceIife(source: string, kind: JsKind): string;
