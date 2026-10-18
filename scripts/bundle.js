import esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const shared = {
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
};

await esbuild.build({
  ...shared,
  entryPoints: ['dist/browser.js'],
  globalName: 'EmojiEngineMagic',
  footer: {
    js: 'globalThis.EmojiEngineMagic = EmojiEngineMagic;\nglobalThis.Magic = EmojiEngineMagic;',
  },
  outfile: 'browser/emoji-engine-magic.js',
});

const minFile = 'browser/emoji-engine-magic.min.js';

await esbuild.build({
  ...shared,
  stdin: {
    contents: `import { compile, Lexer, Parser, Compiler, MagicError } from './src/browser.ts';
globalThis.EmojiEngineMagic = { compile, Lexer, Parser, Compiler, MagicError };
globalThis.Magic = globalThis.EmojiEngineMagic;
`,
    resolveDir: root,
    sourcefile: 'emoji-engine-magic.ts',
    loader: 'ts',
  },
  minify: true,
  legalComments: 'none',
  treeShaking: true,
  outfile: minFile,
});

for (const stale of ['dist/emoji-engine-magic.js', 'dist/emoji-engine-magic.min.js']) {
  rmSync(path.join(root, stale), { force: true });
}

const bytes = readFileSync(path.join(root, minFile));
const gzip = gzipSync(bytes).length;
console.log(`${minFile} ${bytes.length} bytes, ${gzip} gzip`);
