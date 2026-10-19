/**
 * Language check, a headless Witch Hunt, a small desk, and an Electron pack.
 * Run: npm run demo
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { installHostShims } from '../../emoji-engine-2d/examples/dom-shim.js';
import * as EmojiEngine from '../../emoji-engine-2d/dist/index.js';
import { App, MagicError, Runtime, bundle, compile } from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examples = path.join(root, 'examples');
const runtime = new Runtime({ root });

installHostShims();

const expected = [
  '3',
  'n=3',
  'Hello',
  'Magic',
  'witch',
  '3',
  'Ada',
  '2',
  '2',
  '6',
  '12',
  'witchhunterwand',
  'yes',
  'six',
  '2',
  '2',
  'ne',
  '7',
  '8',
  'true',
  '',
  '10',
  '2',
  '3',
  'a\tb',
  '5',
  '1',
  'Counter',
  'fn',
  'fn',
  'ok',
];

const checkLines = await capture(path.join(examples, 'check.magic'));
expectLines(checkLines, expected, 'check.magic');

const huntLines = await capture(path.join(examples, 'hunt.magic'));
if (!huntLines.some((line) => line.includes('hit'))) fail(`hunt missed\n${huntLines.join('\n')}`);
if (huntLines[huntLines.length - 1] !== 'hunt ok') fail(`hunt\n${huntLines.join('\n')}`);

const deskLines = await capture(path.join(examples, 'desk.magic'));
if (deskLines[deskLines.length - 1] !== 'desk ok') fail(`desk\n${deskLines.join('\n')}`);

expectLines(runSnippet(`
let word = ""
for i = 3 to 1 step -1
  word = word & str(i)
end
print word
`), ['321'], 'negative step');

expectLines(runSnippet(`
let k = 0
if k == 1 then
  print "a"
elseif k == 0 then
  print "b"
else
  print "c"
end
`), ['b'], 'elseif');

expectLines(runSnippet(`
fn greet(name)
  return "Hello, " .. name
end
print greet "Ada"
`), ['Hello, Ada'], 'string call');

expectLines(runSnippet('print 10 mod 3\n'), ['1'], 'mod');

expectLines(runSnippet(`
class Box
  n = 1
  fn new()
  end
  fn read()
    let inner = fn()
      return self.n
    end
    return inner()
  end
end
print Box().read()
`), ['1'], 'lexical self');

expectLines(runSnippet('print nil or "bee"\n'), ['bee'], 'or');

expectLines(runSnippet(`
try
  throw "boom"
catch err
  print err.message
finally
  print "done"
end
`), ['boom', 'done'], 'try catch finally');

expectLines(runSnippet(`
try
  push(1, 2)
catch
  print "caught"
end
`), ['caught'], 'catch without a name');

expectLines(runSnippet(`
try
  print "ok"
finally
  print "fin"
end
`), ['ok', 'fin'], 'try finally');

expectLines(runSnippet(`
try
  throw error("nope")
catch err
  print err.message
end
`), ['nope'], 'error()');

expectLines(await captureSource(`
async fn ping()
  return await 7
end
await sleep(1)
print await ping()
`), ['7'], 'async await');

expectLines(await captureSource(`
import shout, add from "./helpers.js"
import default as twice from "./helpers.js"
import "./helpers.js" as helpers
print shout("witch")
print add(2, 3)
print twice(4)
print helpers.shout("ok")
`, path.join(examples, 'js-import.magic')), ['WITCH', '5', '8', 'OK'], 'js import');

expectLines(await captureSource(`
import triple from "./plain.js"
print triple(3)
`, path.join(examples, 'plain-import.magic')), ['9'], 'plain js import');

expectLines(await captureSource(`
import hp, name from "./stats.json"
let data = await load("stats.json")
print hp
print name
print data.hp
`, path.join(examples, 'json-import.magic')), ['3', 'Ada', '3'], 'json import and load');

expectLines(runSnippet(`
let word = ""
for i = 1 to 4
  if i == 2 then
    continue
  end
  word = word & str(i)
end
print word
`), ['134'], 'continue');

mustThrow('fn hi()\nprint 1\n', 'expected end');
mustThrow('if a = b then\nend\n', 'use == to compare');
mustThrow('break\n', 'break belongs inside');
mustThrow('print self\n', 'self belongs inside a class');
mustThrow('print "hi', 'this string never ends');
mustThrow('import greet from "./words.magic"\n', 'this script imports another Magic file', { target: 'script' });
mustThrow('import shout from "./helpers.js"\n', 'this script imports a JavaScript file', { target: 'script' });
mustThrow('try\nprint 1\nend\n', 'try needs catch or finally');
mustThrow('throw\n', 'throw needs a value');
mustThrow('fn go()\nawait 1\nend\n', 'await belongs inside an async fn');
mustThrow('class Box\n  async fn new()\n  end\nend\n', 'fn new cannot be async');
mustThrow('import default from "./helpers.js"\n', 'is reserved');

expectLines(runSnippet(`
@strict
@note("ok")
let hp as number = 3
fn greet(name as string) as string
  return "Hello, " .. name
end
print greet("Ada")
print hp
`), ['Hello, Ada', '3'], 'strict types');

expectLines(runSnippet(`
@strict
class Vault
  private key = "moon"
  public fn read()
    return self.key
  end
end
print Vault().read()
`), ['moon'], 'strict private inside');

expectLines(runSnippet(`
@strict
class Box
  protected tag = "ok"
end
class Child is Box
  fn read()
    return self.tag
  end
end
print Child().read()
`), ['ok'], 'strict protected child');

mustThrow(`
@strict
let hp as number = "no"
`, 'cannot assign string to number');

mustThrow(`
@strict
class Box
  private n = 0
end
print Box().n
`, 'n is private on Box');

mustThrow(`
@strict
class Box
  private n = 0
end
let box = Box()
print box.n
`, 'n is private on Box');

expectLines(runSnippet(`
@strict
let n = 1
n = "ok"
print n
`), ['ok'], 'untyped stays free');

mustThrow(`
@strict
class Box
  protected n = 0
end
print Box().n
`, 'n is protected on Box');

mustThrow(`
class Box
  private n = 0
end
`, 'belongs in a @strict class');

mustThrow(`
@strict
push(1, 2)
`, 'push expects a list');

mustThrow(`
@strict
fn greet(name as string)
  return name
end
print greet(1)
`, 'cannot assign number to string');

const strictLines = await capture(path.join(examples, 'strict.magic'));
expectLines(strictLines, ['Hello, Ada', 'star', 'chest!', '3'], 'strict.magic');

const checkMod = bundle(path.join(examples, 'check.magic'), { target: 'module' });
if (!checkMod.code.includes('from "emoji-engine-2d"')) fail('module bundle dropped 2d');
if (!checkMod.code.includes('from "emoji-engine-3d"')) fail('module bundle dropped 3d');
if (!checkMod.code.includes('from "emoji-engine-ui"')) fail('module bundle dropped ui');
if (!checkMod.exports.includes('Counter')) fail('module bundle dropped Counter');
if (checkMod.exports.includes('greet')) fail('an import was re-exported');

const huntScript = bundle(path.join(examples, 'hunt.magic'), { target: 'script' });
if (/\bimport\b/.test(huntScript.code)) fail('script bundle still has an import');
if (!huntScript.code.includes('globalThis.EmojiEngine')) fail('script bundle should read EmojiEngine');

const jsPacked = bundle(path.join(examples, 'jsuse.magic'), { target: 'module' });
if (!jsPacked.code.includes('helpers.js')) fail('module bundle dropped helpers.js');
const jsScript = bundle(path.join(examples, 'jsuse.magic'), { target: 'script' });
if (!jsScript.code.includes('encodeURIComponent')) fail('script bundle did not inline helpers.js');

const appDir = mkdtempSync(path.join(tmpdir(), 'magic-app-'));
try {
  const packed = App.pack(path.join(examples, 'hunt.magic'), {
    out: appDir,
    name: 'witch-hunt',
    title: 'Witch Hunt',
    width: 960,
    height: 720,
  });
  if (packed.dir !== appDir) fail('pack dir');
  if (packed.engines.join(',') !== '2d') fail(`pack engines ${packed.engines.join(',')}`);
  const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  if (pkg.name !== 'witch-hunt' || pkg.type !== 'module' || pkg.main !== 'main.js') fail('pack package.json');
  const main = readFileSync(path.join(appDir, 'main.js'), 'utf8');
  if (!main.includes('contextIsolation: true') || !main.includes('nodeIntegration: false') || !main.includes('sandbox: true')) {
    fail('pack window is not locked down');
  }
  const page = readFileSync(path.join(appDir, 'index.html'), 'utf8');
  if (!page.includes('./engines/emoji-engine-2d.js') || !page.includes('./game.js')) fail('pack html');
  if (!existsSync(path.join(appDir, 'engines', 'emoji-engine-2d.js'))) fail('2d browser build was not copied');
  if (existsSync(path.join(appDir, 'engines', 'emoji-engine-3d.js'))) fail('3d was copied into a 2d game');
  nodeCheck(path.join(appDir, 'main.js'));
  nodeCheck(path.join(appDir, 'game.js'));
} finally {
  rmSync(appDir, { recursive: true, force: true });
}

const cli = path.join(root, 'dist', 'cli.js');
const compiled = path.join(tmpdir(), `magic-check-${process.pid}.js`);
const compileRun = spawnSync(process.execPath, [cli, 'compile', path.join(examples, 'check.magic'), '-o', compiled], {
  encoding: 'utf8',
});
if (compileRun.status !== 0) fail(compileRun.stderr || 'magic compile failed');
nodeCheck(compiled);
rmSync(compiled, { force: true });

const runCli = spawnSync(process.execPath, [cli, 'run', path.join(examples, 'check.magic')], { encoding: 'utf8' });
if (runCli.status !== 0) fail(runCli.stderr || 'magic run failed');
if (!runCli.stdout.endsWith('ok\n')) fail(`magic run\n${runCli.stdout}`);

const msx = path.join(root, 'dist', 'tools', 'msx.js');
const msxEval = spawnSync(process.execPath, [msx, '-e', 'print 1 + 2'], { encoding: 'utf8' });
if (msxEval.status !== 0) fail(msxEval.stderr || 'msx -e failed');
if (msxEval.stdout.trim() !== '3') fail(`msx -e\n${msxEval.stdout}`);

const msxFile = spawnSync(process.execPath, [msx, path.join(examples, 'strict.magic')], { encoding: 'utf8' });
if (msxFile.status !== 0) fail(msxFile.stderr || 'msx file failed');
if (!msxFile.stdout.includes('Hello, Ada')) fail(`msx file\n${msxFile.stdout}`);

const js2magic = path.join(root, 'dist', 'tools', 'js2magic.js');
const converted = spawnSync(process.execPath, [js2magic, path.join(examples, 'sample.ts')], { encoding: 'utf8' });
if (converted.status !== 0) fail(converted.stderr || 'js2magic failed');
if (!converted.stdout.includes('@strict')) fail('js2magic dropped @strict');
if (!converted.stdout.includes('fn greet(name as string) as string')) fail(`js2magic greet\n${converted.stdout}`);
if (!converted.stdout.includes('private n as number = 0')) fail(`js2magic field\n${converted.stdout}`);
if (!converted.stdout.includes('fn new(start as number)')) fail(`js2magic new\n${converted.stdout}`);
if (!converted.stdout.includes('print greet("Ada")')) fail(`js2magic print\n${converted.stdout}`);
const roundTrip = compile(converted.stdout, { filename: 'sample.magic', target: 'script' });
if (!roundTrip.strict) fail('converted sample was not strict');
if (!roundTrip.code.includes('__magic_print')) fail('converted sample did not compile');

const page = readFileSync(path.join(examples, 'play.html'), 'utf8');
const magic = page.match(/<script type="text\/magic"[^>]*>([\s\S]*?)<\/script>/);
if (!magic) fail('play.html has no Magic script');
const play = compile(magic[1], { filename: 'play.magic', target: 'script' });
if (!play.code.includes('globalThis.requestAnimationFrame')) fail('play.html did not compile the frame loop');
if (!play.code.includes('globalThis.EmojiEngine')) fail('play.html did not bind the 2d engine');
globalThis.EmojiEngine = EmojiEngine;
let frames = 0;
const previousFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => {
  frames += 1;
  if (frames === 1) callback(0);
  return frames;
};
try {
  new Function(play.code)();
} catch (error) {
  const text = error instanceof Error ? error.stack ?? error.message : String(error);
  fail(`play.html\n${text}`);
} finally {
  globalThis.requestAnimationFrame = previousFrame;
}
if (frames < 1) fail('play.html did not schedule a frame');
if (!textOf(globalThis.document.body).includes('browser ok')) {
  fail(`play.html frame did not reach the footer\n${textOf(globalThis.document.body)}`);
}

checkBundle('emoji-engine-magic.js');
checkBundle('emoji-engine-magic.min.js');

console.log('demo ok');

async function captureSource(source, filename = 'snippet.magic') {
  const lines = [];
  const previous = console.log;
  console.log = (...args) => {
    lines.push(args.map((arg) => String(arg)).join('\t'));
  };
  try {
    await runtime.run(source, filename);
  } catch (error) {
    console.log = previous;
    const text = error instanceof MagicError ? error.format() : error instanceof Error ? error.stack ?? error.message : String(error);
    fail(`${path.basename(filename)}\n${text}\n${lines.join('\n')}`);
  }
  console.log = previous;
  return lines;
}

async function capture(file) {
  const lines = [];
  const previous = console.log;
  console.log = (...args) => {
    lines.push(args.map((arg) => String(arg)).join('\t'));
  };
  try {
    await runtime.runFile(file);
  } catch (error) {
    console.log = previous;
    const text = error instanceof MagicError ? error.format() : error instanceof Error ? error.stack ?? error.message : String(error);
    fail(`${path.basename(file)}\n${text}\n${lines.join('\n')}`);
  }
  console.log = previous;
  return lines;
}

function runSnippet(source) {
  const result = compile(source, { filename: 'snippet.magic', target: 'script' });
  const sandbox = {
    logs: [],
    console: {
      log(...args) {
        sandbox.logs.push(args.map((arg) => String(arg)).join('\t'));
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(result.code, sandbox, { filename: 'snippet.js' });
  } catch (error) {
    const text = error instanceof Error ? error.stack ?? error.message : String(error);
    fail(`${text}\n${result.code}`);
  }
  return sandbox.logs;
}

function mustThrow(source, text, options = {}) {
  let threw = false;
  try {
    compile(source, { filename: 'bad.magic', target: options.target ?? 'module' });
  } catch (error) {
    threw = true;
    if (!(error instanceof MagicError)) fail(`${text}: expected MagicError, got ${error}`);
    if (!String(error.message).includes(text)) fail(`${text}: got ${error.format()}`);
  }
  if (!threw) fail(`expected an error containing ${text}`);
}

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${file}\n${result.stderr}`);
}

function checkBundle(file) {
  const code = readFileSync(path.join(root, 'browser', file), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { filename: file });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    fail(`${file} did not run: ${text}`);
  }
  const api = sandbox.EmojiEngineMagic;
  if (!api || typeof api.compile !== 'function') fail(`${file} missing compile`);
  if (sandbox.Magic !== api) fail(`${file} missing the Magic alias`);
  const out = api.compile('print 1\n', { target: 'script', filename: 'browser.magic' });
  if (!out.code.includes('__magic_print')) fail(`${file} compile did not emit print`);
}

function expectLines(actual, wanted, label) {
  const same = actual.length === wanted.length && actual.every((line, index) => line === wanted[index]);
  if (!same) fail(`${label}\nexpected ${JSON.stringify(wanted)}\nactual   ${JSON.stringify(actual)}`);
}

function textOf(node) {
  const parts = [String(node?.textContent ?? '')];
  for (const child of node?.children ?? []) parts.push(textOf(child));
  return parts.join('\n');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
