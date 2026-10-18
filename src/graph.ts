import fs from 'node:fs';
import path from 'node:path';
import type { ImportStmt, Program } from './ast.js';
import { isMagicSpecifier, isRelativeJsSpecifier } from './engines.js';
import { MagicError } from './error.js';
import { resolveJsFile } from './jsmod.js';
import { Parser } from './parser.js';

export interface LoadedModule {
  absPath: string;
  source: string;
  program: Program;
}

/**
 * Read a script and the Magic files it imports.
 * The result is in dependency order: a file comes after the files it imports.
 */
export function loadGraph(entry: string, sources?: ReadonlyMap<string, string>): LoadedModule[] {
  const absEntry = path.resolve(entry);
  const done = new Map<string, LoadedModule>();
  const order: LoadedModule[] = [];
  const stack: string[] = [];

  const visit = (abs: string, from: ImportStmt | null, fromFile: string): void => {
    if (done.has(abs)) return;
    if (stack.includes(abs)) {
      const start = stack.indexOf(abs);
      const cycle = [...stack.slice(start), abs].map((file) => path.basename(file));
      throw new MagicError(`import cycle: ${cycle.join(' -> ')}`, from?.line ?? 1, from?.column ?? 1, fromFile);
    }
    stack.push(abs);
    const source = readSource(abs, from, fromFile, sources);
    const program = new Parser(abs).parse(source);
    for (const stmt of program.body) {
      if (stmt.kind !== 'import') continue;
      if (isMagicSpecifier(stmt.specifier)) {
        visit(resolveMagicFile(abs, stmt.specifier), stmt, abs);
        continue;
      }
      if (isRelativeJsSpecifier(stmt.specifier)) {
        const jsPath = resolveJsFile(abs, stmt.specifier);
        if (!fs.existsSync(jsPath) || !fs.statSync(jsPath).isFile()) {
          throw new MagicError(`cannot find ${stmt.specifier}`, stmt.line, stmt.column, abs);
        }
      }
    }
    stack.pop();
    const loaded = { absPath: abs, source, program };
    done.set(abs, loaded);
    order.push(loaded);
  };

  visit(absEntry, null, absEntry);
  return order;
}

export { resolveJsFile } from './jsmod.js';

/** `./witch` and `./witch.magic` both name a Magic file next to `fromFile`. */
export function resolveMagicFile(fromFile: string, specifier: string): string {
  const spec = specifier.endsWith('.magic') ? specifier : `${specifier}.magic`;
  return path.resolve(path.dirname(fromFile), spec);
}

/** Deepest directory that contains every file. */
export function commonDir(files: string[]): string {
  const split = files.map((file) => path.dirname(path.resolve(file)).split(path.sep));
  const first = split[0] ?? [''];
  let length = 0;
  while (first[length] !== undefined && split.every((parts) => parts[length] === first[length])) length += 1;
  const root = first.slice(0, length).join(path.sep);
  return root || path.sep;
}

/** A flat file name that stays unique when several folders use the same name. */
export function moduleFile(root: string, absPath: string): string {
  const rel = path.relative(root, absPath);
  return rel.split(path.sep).join('__').replace(/\.magic$/i, '.js');
}

function readSource(
  abs: string,
  from: ImportStmt | null,
  fromFile: string,
  sources: ReadonlyMap<string, string> | undefined,
): string {
  const override = sources?.get(abs);
  if (override !== undefined) return override;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    const name = from ? from.specifier : abs;
    throw new MagicError(`cannot find ${name}`, from?.line ?? 1, from?.column ?? 1, fromFile);
  }
  return fs.readFileSync(abs, 'utf8');
}
