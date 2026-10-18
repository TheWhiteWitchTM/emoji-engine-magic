#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { App } from './app.js';
import { bundle } from './bundle.js';
import { MagicError } from './error.js';
import { Runtime } from './runtime.js';
const HELP = `Magic compiles a small language to JavaScript.

  magic run <file>
  magic compile <file> [-o out.js]
  magic app <file> [-o dir] [--title text] [--name slug] [--width n] [--height n]
  magic help
`;
async function main() {
    const argv = process.argv.slice(2);
    const cmd = argv[0];
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
        process.stdout.write(HELP);
        return;
    }
    const parsed = parseArgs(argv.slice(1));
    if (cmd === 'run') {
        const runtime = new Runtime();
        await runtime.runFile(needFile(parsed.file));
        return;
    }
    if (cmd === 'compile') {
        const result = bundle(path.resolve(needFile(parsed.file)), { target: 'module' });
        const out = parsed.flags['-o'];
        if (out)
            fs.writeFileSync(path.resolve(out), result.code);
        else
            process.stdout.write(result.code);
        return;
    }
    if (cmd === 'app') {
        const packed = App.pack(path.resolve(needFile(parsed.file)), {
            out: parsed.flags['-o'],
            title: parsed.flags['--title'],
            name: parsed.flags['--name'],
            width: numberFlag(parsed.flags['--width'], '--width'),
            height: numberFlag(parsed.flags['--height'], '--height'),
        });
        process.stdout.write(`${packed.dir}\n`);
        process.stdout.write('npm install && npm start\n');
        return;
    }
    throw new MagicError(`unknown command ${cmd}. Try magic help`);
}
function parseArgs(argv) {
    const flags = {};
    let file;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i] ?? '';
        if (arg.startsWith('-')) {
            const value = argv[i + 1];
            if (!value || value.startsWith('-'))
                throw new MagicError(`${arg} needs a value`);
            flags[arg] = value;
            i += 1;
            continue;
        }
        if (!file)
            file = arg;
    }
    return { file, flags };
}
function needFile(file) {
    if (!file)
        throw new MagicError('give Magic a script, for example magic run game.magic');
    return file;
}
function numberFlag(value, label) {
    if (value === undefined)
        return undefined;
    const n = Number(value);
    if (!Number.isFinite(n))
        throw new MagicError(`${label} needs a number`);
    return n;
}
main().catch((error) => {
    if (error instanceof MagicError)
        process.stderr.write(`${error.format()}\n`);
    else
        process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map