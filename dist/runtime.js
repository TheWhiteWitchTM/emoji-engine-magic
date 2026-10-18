import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Compiler } from './compiler.js';
import { engineKey, isMagicSpecifier } from './engines.js';
import { MagicError } from './error.js';
import { commonDir, loadGraph, moduleFile, resolveMagicFile } from './graph.js';
import { engineFileUrl } from './locate.js';
import { preludeModuleSource } from './std.js';
/**
 * Runs Magic on Node.
 * Each run writes a new folder of ES modules and imports the entry.
 * A new folder matters: Node caches a module by its URL.
 */
export class Runtime {
    root;
    outDir;
    constructor(options = {}) {
        this.root = path.resolve(options.root ?? process.cwd());
        if (options.outDir) {
            this.outDir = path.resolve(options.outDir);
            fs.mkdirSync(this.outDir, { recursive: true });
        }
        else {
            this.outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-'));
        }
    }
    /** Read `file` and the Magic files it imports, then run the entry. */
    async runFile(file) {
        const abs = path.resolve(this.root, file);
        return this.execute(abs);
    }
    /**
     * Run source that may not be on disk.
     * `filename` is the name errors use, and the folder imports are resolved from.
     */
    async run(source, filename = 'main.magic') {
        const abs = path.resolve(this.root, filename);
        return this.execute(abs, new Map([[abs, source]]));
    }
    async execute(entry, sources) {
        const loaded = loadGraph(entry, sources);
        const graphRoot = commonDir(loaded.map((mod) => mod.absPath));
        const names = new Map();
        const used = new Set();
        for (const mod of loaded) {
            const file = moduleFile(graphRoot, mod.absPath);
            if (file === 'magic-std.js') {
                throw new MagicError(`${mod.absPath} would overwrite the prelude. Rename it.`);
            }
            if (used.has(file))
                throw new MagicError(`two scripts would both compile to ${file}`);
            used.add(file);
            names.set(mod.absPath, file);
        }
        const dir = fs.mkdtempSync(path.join(this.outDir, 'run-'));
        fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
        fs.writeFileSync(path.join(dir, 'magic-std.js'), preludeModuleSource());
        const entryPath = path.resolve(entry);
        let entryFile = 'main.js';
        for (const mod of loaded) {
            const file = names.get(mod.absPath);
            if (mod.absPath === entryPath)
                entryFile = file;
            const compiled = new Compiler().compileProgram(mod.program, {
                filename: mod.absPath,
                target: 'module',
                prelude: './magic-std.js',
                resolve: (specifier) => this.resolve(mod.absPath, specifier, names),
            });
            fs.writeFileSync(path.join(dir, file), compiled.code);
        }
        const href = pathToFileURL(path.join(dir, entryFile)).href;
        const imported = (await import(`${href}?t=${Date.now()}`));
        return imported;
    }
    resolve(fromFile, specifier, names) {
        const engine = engineKey(specifier);
        if (engine)
            return engineFileUrl(engine);
        if (isMagicSpecifier(specifier)) {
            const abs = resolveMagicFile(fromFile, specifier);
            const file = names.get(abs);
            if (!file)
                throw new MagicError(`cannot find ${specifier}`, 1, 1, fromFile);
            return `./${file.split(path.sep).join('/')}`;
        }
        return specifier;
    }
}
//# sourceMappingURL=runtime.js.map