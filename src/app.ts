import fs from 'node:fs';
import path from 'node:path';
import { bundle } from './bundle.js';
import { ENGINES, type EngineName } from './engines.js';
import { MagicError } from './error.js';
import { engineBrowserFile } from './locate.js';

export interface PackOptions {
  /** Folder to write. Default is `build/<name>` in the current directory. */
  out?: string;
  /** Package name. Default is the script's file name. */
  name?: string;
  /** Window title. Default is the package name. */
  title?: string;
  /** Window width in pixels. Default 960. */
  width?: number;
  /** Window height in pixels. Default 720. */
  height?: number;
}

export interface PackResult {
  dir: string;
  engines: EngineName[];
}

/**
 * Turns one Magic script into an Electron project.
 * It copies the browser builds the script actually imports.
 * It does not download Electron. The project README says how to start it.
 */
export class App {
  static pack(entry: string, options: PackOptions = {}): PackResult {
    const abs = path.resolve(entry);
    const stem = path.basename(abs).replace(/\.magic$/i, '') || 'game';
    const name = slug(options.name ?? stem);
    const title = options.title ?? name;
    const width = pixels(options.width, 960, 'width');
    const height = pixels(options.height, 720, 'height');
    const dir = path.resolve(options.out ?? path.join('build', name));
    const packed = bundle(abs, { target: 'script' });

    fs.mkdirSync(dir, { recursive: true });
    const engineDir = path.join(dir, 'engines');
    fs.mkdirSync(engineDir, { recursive: true });
    for (const engine of packed.engines) {
      const info = ENGINES[engine];
      fs.copyFileSync(engineBrowserFile(engine), path.join(engineDir, info.file));
    }

    fs.writeFileSync(path.join(dir, 'game.js'), packed.code);
    fs.writeFileSync(path.join(dir, 'index.html'), html(title, packed.engines));
    fs.writeFileSync(path.join(dir, 'main.js'), mainJs(title, width, height));
    fs.writeFileSync(path.join(dir, 'package.json'), packageJson(name));
    fs.writeFileSync(path.join(dir, 'README.md'), readme(title));
    return { dir, engines: packed.engines };
  }
}

function pixels(value: number | undefined, fallback: number, label: string): number {
  const n = value ?? fallback;
  if (!Number.isFinite(n) || n <= 0) throw new MagicError(`${label} needs a positive number`);
  return Math.round(n);
}

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'magic-app';
}

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      private: true,
      version: '0.1.0',
      type: 'module',
      main: 'main.js',
      scripts: { start: 'electron .' },
      devDependencies: { electron: '^33.0.0' },
    },
    null,
    2,
  )}\n`;
}

function mainJs(title: string, width: number, height: number): string {
  return `import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function create() {
  const win = new BrowserWindow({
    width: ${width},
    height: ${height},
    title: ${JSON.stringify(title)},
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(dir, 'index.html'));
}

app.whenReady().then(create);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) create();
});
`;
}

function html(title: string, engines: EngineName[]): string {
  const tags = engines
    .map((engine) => `  <script src="./engines/${ENGINES[engine].file}"></script>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeText(title)}</title>
  <style>
    html, body { margin: 0; background: #111; color: #ddd; }
    body { display: flex; min-height: 100vh; align-items: center; justify-content: center; }
  </style>
</head>
<body>
${tags}
  <script src="./game.js"></script>
</body>
</html>
`;
}

function readme(title: string): string {
  return `# ${title}

This folder was packed by Magic. Install Electron, then start the window.

\`\`\`bash
npm install
npm start
\`\`\`
`;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
