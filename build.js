import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');

const compile = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
  cwd: root,
  stdio: 'inherit',
});

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

await import('./scripts/bundle.js');
