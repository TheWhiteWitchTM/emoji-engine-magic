import type { ImportStmt } from './ast.js';
import { Compiler, type BodyBinding } from './compiler.js';
import { ENGINES, engineKey, isMagicSpecifier, type EngineName } from './engines.js';
import { MagicError } from './error.js';
import { commonDir, loadGraph, moduleFile, resolveMagicFile, type LoadedModule } from './graph.js';
import { preludeInlineSource } from './std.js';

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

const ORDER: EngineName[] = ['2d', '3d', 'ui'];

/**
 * Compile a Magic file and every Magic file it imports into one JavaScript file.
 * Engine imports stay as package imports or as the browser globals.
 */
export function bundle(entry: string, options: BundleOptions = {}): BundleResult {
  const target = options.target ?? 'module';
  const loaded = loadGraph(entry);
  const root = commonDir(loaded.map((mod) => mod.absPath));
  const ids = new Map<string, string>();
  loaded.forEach((mod, index) => {
    ids.set(mod.absPath, `__mod_${index}`);
  });
  const engines = new Set<EngineName>();
  const external = new Map<string, string>();
  for (const mod of loaded) {
    for (const stmt of magicImports(mod)) {
      const engine = engineKey(stmt.specifier);
      if (engine) {
        engines.add(engine);
        continue;
      }
      if (isMagicSpecifier(stmt.specifier)) continue;
      if (target === 'script') {
        throw new MagicError(
          `${stmt.specifier} is not a Magic file or an emoji engine, so one script cannot pack it`,
          stmt.line,
          stmt.column,
          mod.absPath,
        );
      }
      if (!external.has(stmt.specifier)) external.set(stmt.specifier, `__magic_ext_${external.size}`);
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
    for (const [spec, id] of external) {
      lines.push(`import * as ${id} from ${JSON.stringify(spec)};`);
    }
  }
  lines.push(target === 'script' ? '(() => {' : '');
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

  const compiler = new Compiler();
  let entryExports: string[] = [];
  for (const mod of loaded) {
    const id = ids.get(mod.absPath)!;
    const bindings = bindingsFor(mod, ids, external);
    const body = compiler.emitBody(mod.program, { filename: mod.absPath, bindings });
    if (mod.absPath === entryPath) entryExports = body.exports;
    lines.push(`const ${id} = (() => {`);
    lines.push(body.code.trimEnd());
    lines.push('})();');
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

function bindingsFor(mod: LoadedModule, ids: Map<string, string>, external: Map<string, string>): BodyBinding[] {
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
  external: Map<string, string>,
): string | null {
  const engine = engineKey(stmt.specifier);
  if (engine) return engineNs(engine);
  if (isMagicSpecifier(stmt.specifier)) {
    const abs = resolveMagicFile(fromFile, stmt.specifier);
    const id = ids.get(abs);
    if (!id) throw new MagicError(`cannot find ${stmt.specifier}`, stmt.line, stmt.column, fromFile);
    return id;
  }
  return external.get(stmt.specifier) ?? null;
}

function magicImports(mod: LoadedModule): ImportStmt[] {
  return mod.program.body.filter((stmt): stmt is ImportStmt => stmt.kind === 'import');
}

function engineNs(name: EngineName): string {
  return `__magic_eng_${name}`;
}

export { commonDir, moduleFile };
