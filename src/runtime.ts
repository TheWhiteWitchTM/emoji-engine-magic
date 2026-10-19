import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Compiler } from './compiler.js';
import { engineKey, isMagicSpecifier, isRelativeJsSpecifier } from './engines.js';
import { MagicError } from './error.js';
import { commonDir, loadGraph, moduleFile, resolveMagicFile } from './graph.js';
import { classifyJs, resolveJsFile, toEsmSource } from './jsmod.js';
import { engineFileUrl } from './locate.js';
import { preludeModuleSource } from './std.js';

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
export class Runtime {
  readonly root: string;
  readonly outDir: string;
  readonly strict: boolean;

  constructor(options: RuntimeOptions = {}) {
    this.strict = options.strict === true;
    this.root = path.resolve(options.root ?? process.cwd());
    if (options.outDir) {
      this.outDir = path.resolve(options.outDir);
      fs.mkdirSync(this.outDir, { recursive: true });
    } else {
      this.outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-'));
    }
  }

  /** Read `file` and the Magic files it imports, then run the entry. */
  async runFile(file: string): Promise<MagicModule> {
    const abs = path.resolve(this.root, file);
    return this.execute(abs);
  }

  /**
   * Run source that may not be on disk.
   * `filename` is the name errors use, and the folder imports are resolved from.
   */
  async run(source: string, filename = 'main.magic'): Promise<MagicModule> {
    const abs = path.resolve(this.root, filename);
    return this.execute(abs, new Map([[abs, source]]));
  }

  private async execute(entry: string, sources?: Map<string, string>): Promise<MagicModule> {
    const loaded = loadGraph(entry, sources);
    const graphRoot = commonDir(loaded.map((mod) => mod.absPath));
    const names = new Map<string, string>();
    const used = new Set<string>();
    for (const mod of loaded) {
      const file = moduleFile(graphRoot, mod.absPath);
      if (file === 'magic-std.js') {
        throw new MagicError(`${mod.absPath} would overwrite the prelude. Rename it.`);
      }
      if (used.has(file)) throw new MagicError(`two scripts would both compile to ${file}`);
      used.add(file);
      names.set(mod.absPath, file);
    }

    const dir = fs.mkdtempSync(path.join(this.outDir, 'run-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
    fs.writeFileSync(path.join(dir, 'magic-std.js'), preludeModuleSource());

    const jsShims = new Map<string, string>();
    const entryPath = path.resolve(entry);
    let entryFile = 'main.js';
    for (const mod of loaded) {
      const file = names.get(mod.absPath)!;
      if (mod.absPath === entryPath) entryFile = file;
      const compiled = new Compiler().compileProgram(mod.program, {
        filename: mod.absPath,
        target: 'module',
        prelude: './magic-std.js',
        strict: this.strict,
        resolve: (specifier) => this.resolve(mod.absPath, specifier, names, dir, jsShims),
      });
      fs.writeFileSync(path.join(dir, file), compiled.code);
    }

    const href = pathToFileURL(path.join(dir, entryFile)).href;
    const previousHook = (globalThis as { __magic_load_hook?: unknown }).__magic_load_hook;
    (globalThis as { __magic_load_hook?: unknown }).__magic_load_hook = this.loadHook(path.dirname(entryPath));
    try {
      const imported = (await import(`${href}?t=${Date.now()}`)) as MagicModule;
      return imported;
    } finally {
      (globalThis as { __magic_load_hook?: unknown }).__magic_load_hook = previousHook;
    }
  }

  private resolve(
    fromFile: string,
    specifier: string,
    names: Map<string, string>,
    dir: string,
    jsShims: Map<string, string>,
  ): string {
    const engine = engineKey(specifier);
    if (engine) return engineFileUrl(engine);
    if (isMagicSpecifier(specifier)) {
      const abs = resolveMagicFile(fromFile, specifier);
      const file = names.get(abs);
      if (!file) throw new MagicError(`cannot find ${specifier}`, 1, 1, fromFile);
      return `./${file.split(path.sep).join('/')}`;
    }
    if (isRelativeJsSpecifier(specifier)) {
      const abs = resolveJsFile(fromFile, specifier);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        throw new MagicError(`cannot find ${specifier}`, 1, 1, fromFile);
      }
      return this.jsSpecifier(abs, dir, jsShims);
    }
    return specifier;
  }

  /** Real ESM is imported in place. JSON and classic scripts become a sibling module. */
  private jsSpecifier(abs: string, dir: string, jsShims: Map<string, string>): string {
    const hit = jsShims.get(abs);
    if (hit) return hit;
    const source = fs.readFileSync(abs, 'utf8');
    const kind = classifyJs(abs, source);
    if (kind === 'esm') {
      const href = pathToFileURL(abs).href;
      jsShims.set(abs, href);
      return href;
    }
    const file = `js__${jsShims.size}.js`;
    let esm: string;
    try {
      esm = toEsmSource(abs, source, kind);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      throw new MagicError(`${abs}: ${text}`);
    }
    fs.writeFileSync(path.join(dir, file), esm);
    const spec = `./${file}`;
    jsShims.set(abs, spec);
    return spec;
  }

  private loadHook(scriptDir: string): (spec: string, kind: string) => Promise<unknown> {
    return async (spec: string, kind: string) => {
      if (/^https?:\/\//i.test(spec)) {
        const res = await fetch(spec);
        if (!res.ok) throw new Error(`cannot load ${spec}`);
        const want = kind || (/\.json($|\?)/i.test(spec) ? 'json' : 'text');
        if (want === 'json') return res.json();
        if (want === 'bytes') return new Uint8Array(await res.arrayBuffer());
        return res.text();
      }
      const candidates = [path.resolve(scriptDir, spec), path.resolve(this.root, spec), path.resolve(spec)];
      for (const file of candidates) {
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
        const buf = fs.readFileSync(file);
        const want = kind || (/\.json$/i.test(file) ? 'json' : 'text');
        if (want === 'json') return JSON.parse(buf.toString('utf8'));
        if (want === 'bytes') return new Uint8Array(buf);
        return buf.toString('utf8');
      }
      throw new Error(`cannot load ${spec}`);
    };
  }
}
