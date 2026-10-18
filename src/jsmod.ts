import fs from 'node:fs';
import path from 'node:path';

export type JsKind = 'esm' | 'cjs' | 'json';

/** `./math.js` next to the Magic file that imported it. */
export function resolveJsFile(fromFile: string, specifier: string): string {
  return path.resolve(path.dirname(fromFile), specifier);
}

export function classifyJs(file: string, source: string): JsKind {
  if (/\.json$/i.test(file)) return 'json';
  if (/\.cjs$/i.test(file)) return 'cjs';
  if (/\.mjs$/i.test(file)) return 'esm';
  if (/(^|[\n;])\s*export\s/.test(source) || /(^|[\n;])\s*import\s/.test(source)) return 'esm';
  return 'cjs';
}

export function readJsFile(absPath: string): { kind: JsKind; source: string } {
  const source = fs.readFileSync(absPath, 'utf8');
  return { kind: classifyJs(absPath, source), source };
}

/**
 * Turn JSON, classic scripts, and CommonJS into an ES module text.
 * Real ESM is left as it was written.
 */
export function toEsmSource(absPath: string, source: string, kind: JsKind): string {
  if (kind === 'esm') return source.endsWith('\n') ? source : `${source}\n`;
  if (kind === 'json') return wrapJson(source);
  return wrapClassic(source);
}

/** An IIFE that evaluates JSON or classic JS and returns a namespace object. */
export function toNamespaceIife(source: string, kind: JsKind): string {
  if (kind === 'json') {
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid JSON: ${text}`);
    }
    const json = JSON.stringify(value);
    return `(() => { const __v = ${json}; return Object.assign({ default: __v }, __v && typeof __v === "object" && !Array.isArray(__v) ? __v : {}); })()`;
  }
  const names = classicExports(source);
  const auto = names.join(', ');
  return `(() => {
  const module = { exports: {} };
  const exports = module.exports;
${source.trimEnd()}
  const __magic_auto = { ${auto} };
  const __magic_exp = module.exports;
  const __magic_ns = Object.assign(
    {},
    __magic_auto,
    __magic_exp && typeof __magic_exp === "object" && !Array.isArray(__magic_exp) ? __magic_exp : {}
  );
  if (typeof __magic_exp === "function" || (typeof __magic_exp !== "object" && __magic_exp != null)) {
    __magic_ns.default = __magic_exp;
  } else if (__magic_ns.default === undefined) {
    __magic_ns.default = __magic_ns;
  }
  return __magic_ns;
})()`;
}

function wrapJson(source: string): string {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON: ${text}`);
  }
  const json = JSON.stringify(value);
  const lines = [`const __v = ${json};`];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      if (safeExport(key)) lines.push(`export const ${key} = __v[${JSON.stringify(key)}];`);
    }
  }
  lines.push('export default __v;');
  return `${lines.join('\n')}\n`;
}

function wrapClassic(source: string): string {
  const fns = functionNames(source);
  const dots = exportDotNames(source);
  const auto = [...new Set([...fns, ...dots])].join(', ');
  const lines = [
    'const module = { exports: {} };',
    'const exports = module.exports;',
    source.trimEnd(),
    `const __magic_auto = { ${auto} };`,
    'const __magic_exp = module.exports;',
    'const __magic_ns = Object.assign(',
    '  {},',
    '  __magic_auto,',
    '  __magic_exp && typeof __magic_exp === "object" && !Array.isArray(__magic_exp) ? __magic_exp : {}',
    ');',
    'if (typeof __magic_exp === "function" || (typeof __magic_exp !== "object" && __magic_exp != null)) {',
    '  __magic_ns.default = __magic_exp;',
    '} else if (__magic_ns.default === undefined) {',
    '  __magic_ns.default = __magic_ns;',
    '}',
  ];
  for (const name of fns) {
    if (safeExport(name)) lines.push(`export { ${name} };`);
  }
  for (const name of dots) {
    if (fns.includes(name) || !safeExport(name)) continue;
    lines.push(`export const ${name} = __magic_ns[${JSON.stringify(name)}];`);
  }
  lines.push('export default __magic_ns.default;');
  return `${lines.join('\n')}\n`;
}

function functionNames(source: string): string[] {
  const names: string[] = [];
  const fn = /^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let match: RegExpExecArray | null;
  while ((match = fn.exec(source))) names.push(match[1]!);
  return names;
}

function exportDotNames(source: string): string[] {
  const names: string[] = [];
  const dots = /(?:^|[^\w$.])(?:module\.)?exports\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm;
  let match: RegExpExecArray | null;
  while ((match = dots.exec(source))) names.push(match[1]!);
  return names;
}

function classicExports(source: string): string[] {
  return [...new Set([...functionNames(source), ...exportDotNames(source)])];
}

function safeExport(name: string): boolean {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return false;
  return !RESERVED.has(name);
}

const RESERVED = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);
