import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { ImportStmt } from './ast.js';
import { Compiler, type BodyBinding } from './compiler.js';
import { ENGINES, engineKey, isMagicSpecifier, isRelativeJsSpecifier, type EngineName } from './engines.js';
import { MagicError } from './error.js';
import { commonDir, loadGraph, moduleFile, resolveMagicFile, type LoadedModule } from './graph.js';
import { classifyJs, resolveJsFile, toNamespaceIife } from './jsmod.js';
import { preludeInlineSource } from './std.js';

export interface BundleOptions {
  /**
   * `module` is one ES module that imports the engines by package name.
   * `script` is one classic script that reads the engine globals.
   */
  target?: 'module' | 'script';
  /** Check every file as `@strict` unless that file writes `@normal`. */
  strict?: boolean;
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

const ORDER: EngineName[] = ['2d', '3d', 'ui'];

interface ExternalMod {
  id: string;
  specifier: string;
  fromFile: string;
  kind: 'package' | 'esm' | 'inline';
  href: string;
  inline: string | null;
}

/**
 * Compile a Magic file and every Magic file it imports into one JavaScript file.
 * Engine imports stay as package imports or as the browser globals.
 * Relative `.js` / `.json` files are imported or inlined.
 */
export function bundle(entry: string, options: BundleOptions = {}): BundleResult {
  const target = options.target ?? 'module';
  const loaded = loadGraph(entry);
  const ids = new Map<string, string>();
  loaded.forEach((mod, index) => {
    ids.set(mod.absPath, `__mod_${index}`);
  });
  const engines = new Set<EngineName>();
  const external = new Map<string, ExternalMod>();
  const compiler = new Compiler();
  let needsAsync = false;
  for (const mod of loaded) {
    if (compiler.hasTopLevelAwait(mod.program)) needsAsync = true;
    for (const stmt of magicImports(mod)) {
      const engine = engineKey(stmt.specifier);
      if (engine) {
        engines.add(engine);
        continue;
      }
      if (isMagicSpecifier(stmt.specifier)) continue;
      if (isRelativeJsSpecifier(stmt.specifier)) {
        const abs = resolveJsFile(mod.absPath, stmt.specifier);
        if (external.has(abs)) continue;
        const source = fs.readFileSync(abs, 'utf8');
        const kind = classifyJs(abs, source);
        const id = `__magic_ext_${external.size}`;
        if (kind === 'esm') {
          if (target === 'script') needsAsync = true;
          external.set(abs, {
            id,
            specifier: stmt.specifier,
            fromFile: mod.absPath,
            kind: 'esm',
            href: pathToFileURL(abs).href,
            inline: source,
          });
        } else {
          let inline: string;
          try {
            inline = toNamespaceIife(source, kind);
          } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            throw new MagicError(text, stmt.line, stmt.column, mod.absPath);
          }
          external.set(abs, {
            id,
            specifier: stmt.specifier,
            fromFile: mod.absPath,
            kind: 'inline',
            href: abs,
            inline,
          });
        }
        continue;
      }
      if (target === 'script') {
        throw new MagicError(
          `${stmt.specifier} is not a Magic file, a JS file, or an emoji engine, so one script cannot pack it`,
          stmt.line,
          stmt.column,
          mod.absPath,
        );
      }
      if (!external.has(stmt.specifier)) {
        external.set(stmt.specifier, {
          id: `__magic_ext_${external.size}`,
          specifier: stmt.specifier,
          fromFile: mod.absPath,
          kind: 'package',
          href: stmt.specifier,
          inline: null,
        });
      }
    }
  }

  const lines: string[] = [];
  const entryPath = loaded[loaded.length - 1]?.absPath ?? entry;
  lines.push(`// Compiled from ${entryPath} by emoji-engine-magic.`);
  if (target === 'module') {
    for (const name of ORDER) {
      if (!engines.has(name)) continue;
      lines.push(`import * as ${engineNs(name)} from ${JSON.stringify(ENGINES[name].package)};`);
    }
    for (const ext of external.values()) {
      if (ext.kind === 'inline') continue;
      lines.push(`import * as ${ext.id} from ${JSON.stringify(ext.href)};`);
    }
  }
  const open = target === 'script' ? `${needsAsync ? 'async ' : ''}(() => {` : '';
  lines.push(open);
  lines.push(preludeInlineSource().trimEnd());
  if (target === 'script') {
    for (const name of ORDER) {
      if (!engines.has(name)) continue;
      const info = ENGINES[name];
      lines.push(`const ${engineNs(name)} = globalThis.${info.global};`);
      lines.push(
        `if (!${engineNs(name)}) throw new Error(${JSON.stringify(`${info.package} is not loaded`)});`,
      );
    }
  }
  for (const ext of external.values()) {
    if (ext.kind === 'inline' && ext.inline) {
      lines.push(`const ${ext.id} = ${ext.inline};`);
    } else if (target === 'script' && ext.kind === 'esm' && ext.inline !== null) {
      lines.push(
        `const ${ext.id} = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(${JSON.stringify(ext.inline)}));`,
      );
    }
  }

  let entryExports: string[] = [];
  for (const mod of loaded) {
    const id = ids.get(mod.absPath)!;
    const bindings = bindingsFor(mod, ids, external);
    const body = compiler.emitBody(mod.program, { filename: mod.absPath, bindings, strict: options.strict });
    if (mod.absPath === entryPath) entryExports = body.exports;
    const asyncMod = compiler.hasTopLevelAwait(mod.program);
    if (asyncMod) needsAsync = true;
    lines.push(`const ${id} = ${asyncMod ? 'await (async ' : '('}() => {`);
    lines.push(body.code.trimEnd());
    lines.push(asyncMod ? '})();' : '})();');
  }

  if (target === 'module') {
    for (const name of entryExports) lines.push(`export const ${name} = ${ids.get(entryPath)}.${name};`);
  } else {
    lines.push('})();');
  }

  return {
    code: `${lines.filter((line) => line !== '').join('\n')}\n`,
    exports: entryExports,
    engines: ORDER.filter((name) => engines.has(name)),
    files: loaded.map((mod) => mod.absPath),
  };
}

function bindingsFor(
  mod: LoadedModule,
  ids: Map<string, string>,
  external: Map<string, ExternalMod>,
): BodyBinding[] {
  const bindings: BodyBinding[] = [];
  for (const stmt of magicImports(mod)) {
    const ns = namespaceFor(mod.absPath, stmt, ids, external);
    if (!ns) continue;
    if (stmt.form === 'namespace' && stmt.alias) bindings.push({ local: stmt.alias, expr: ns });
    if (stmt.form === 'named') {
      for (const name of stmt.names) bindings.push({ local: name.local, expr: `${ns}.${name.imported}` });
    }
  }
  return bindings;
}

function namespaceFor(
  fromFile: string,
  stmt: ImportStmt,
  ids: Map<string, string>,
  external: Map<string, ExternalMod>,
): string | null {
  const engine = engineKey(stmt.specifier);
  if (engine) return engineNs(engine);
  if (isMagicSpecifier(stmt.specifier)) {
    const abs = resolveMagicFile(fromFile, stmt.specifier);
    const id = ids.get(abs);
    if (!id) throw new MagicError(`cannot find ${stmt.specifier}`, stmt.line, stmt.column, fromFile);
    return id;
  }
  if (isRelativeJsSpecifier(stmt.specifier)) {
    const abs = resolveJsFile(fromFile, stmt.specifier);
    return external.get(abs)?.id ?? null;
  }
  return external.get(stmt.specifier)?.id ?? null;
}

function magicImports(mod: LoadedModule): ImportStmt[] {
  return mod.program.body.filter((stmt): stmt is ImportStmt => stmt.kind === 'import');
}

function engineNs(name: EngineName): string {
  return `__magic_eng_${name}`;
}

export { commonDir, moduleFile };
