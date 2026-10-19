#!/usr/bin/env node
/**
 * Run Magic the way tsx runs TypeScript: a file, an -e snippet, a watch loop, or a REPL.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { MagicError } from '../error.js';
import { Parser } from '../parser.js';
import { Runtime } from '../runtime.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

const HELP = `msx runs Magic files, the way tsx runs TypeScript.

  msx file.magic [args...]
  msx --strict file.magic
  msx --watch file.magic
  msx -e "print 1"
  msx

No file opens a REPL. Arguments after the script are process.argv for that script.
`;

interface Options {
  help: boolean;
  version: boolean;
  watch: boolean;
  strict: boolean;
  evalCode: string | null;
  file: string | null;
  scriptArgs: string[];
}

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (options.evalCode !== null) {
    const runtime = new Runtime({ strict: options.strict });
    await runtime.run(options.evalCode, 'eval.magic');
    return;
  }
  if (!options.file) {
    await repl(options.strict);
    return;
  }
  const file = path.resolve(options.file);
  if (!fs.existsSync(file)) throw new MagicError(`cannot find ${options.file}`);
  process.argv = [process.execPath, file, ...options.scriptArgs];
  if (options.watch) {
    await watch(file, options.strict);
    return;
  }
  await runFile(file, options.strict);
}

function parse(argv: string[]): Options {
  const options: Options = {
    help: false,
    version: false,
    watch: false,
    strict: false,
    evalCode: null,
    file: null,
    scriptArgs: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--') {
      if (options.file) options.scriptArgs.push(...argv.slice(i + 1));
      else options.scriptArgs.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '-v' || arg === '--version') {
      options.version = true;
      continue;
    }
    if (arg === '-w' || arg === '--watch') {
      options.watch = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '-e' || arg === '--eval') {
      const value = argv[i + 1];
      if (!value) throw new MagicError(`${arg} needs a snippet`);
      options.evalCode = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new MagicError(`unknown flag ${arg}. Try msx --help`);
    if (!options.file) {
      options.file = arg;
      continue;
    }
    options.scriptArgs.push(arg);
  }
  return options;
}

async function runFile(file: string, strict: boolean): Promise<void> {
  const runtime = new Runtime({ root: path.dirname(file), strict });
  await runtime.runFile(file);
}

async function watch(file: string, strict: boolean): Promise<void> {
  let running = false;
  let queued = false;
  const kick = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      process.stdout.write(`msx: ${path.basename(file)}\n`);
      await runFile(file, strict);
    } catch (error) {
      writeError(error);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        await kick();
      }
    }
  };
  await kick();
  fs.watch(file, { persistent: true }, () => {
    void kick();
  });
  await new Promise(() => {
    /* watch until the process is killed */
  });
}

async function repl(strict: boolean): Promise<void> {
  process.stdout.write(`Magic ${pkg.version}  (msx).  .help  .exit\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let preamble = '';
  let buffer = '';
  const prompt = () => {
    rl.setPrompt(buffer ? '...   ' : 'magic> ');
    rl.prompt();
  };
  const runChunk = async (chunk: string) => {
    const source = preamble ? `${preamble}\n${chunk}` : chunk;
    const runtime = new Runtime({ strict });
    await runtime.run(source, 'repl.magic');
    if (keepsState(chunk)) preamble = preamble ? `${preamble}\n${chunk}` : chunk;
  };
  prompt();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!buffer && (trimmed === '.exit' || trimmed === '.quit')) {
      rl.close();
      return;
    }
    if (!buffer && trimmed === '.help') {
      process.stdout.write('Type Magic. End a block with end. .exit leaves.\n');
      prompt();
      return;
    }
    if (!buffer && trimmed === '.clear') {
      preamble = '';
      process.stdout.write('ok\n');
      prompt();
      return;
    }
    buffer = buffer ? `${buffer}\n${line}` : line;
    if (!buffer.trim()) {
      buffer = '';
      prompt();
      return;
    }
    if (!isComplete(buffer)) {
      prompt();
      return;
    }
    const chunk = buffer;
    buffer = '';
    void runChunk(chunk)
      .catch((error: unknown) => {
        writeError(error);
      })
      .finally(() => {
        prompt();
      });
  });
  await new Promise<void>((resolve) => {
    rl.on('close', () => resolve());
  });
}

function isComplete(source: string): boolean {
  try {
    new Parser('repl.magic').parse(source);
    return true;
  } catch (error) {
    const message = error instanceof MagicError ? error.message : '';
    if (message.includes('expected end') || message.includes('never ends') || message.includes('same line')) {
      return false;
    }
    return true;
  }
}

function keepsState(source: string): boolean {
  try {
    const program = new Parser('repl.magic').parse(source);
    return program.body.every(
      (stmt) =>
        stmt.kind === 'fn' ||
        stmt.kind === 'class' ||
        stmt.kind === 'let' ||
        stmt.kind === 'import' ||
        stmt.kind === 'assign',
    );
  } catch {
    return false;
  }
}

function writeError(error: unknown): void {
  if (error instanceof MagicError) process.stderr.write(`${error.format()}\n`);
  else process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
}

void main().catch((error: unknown) => {
  writeError(error);
  process.exit(1);
});
