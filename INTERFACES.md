# Public interfaces

These are the contracts for emoji-engine-magic. `src/index.ts` exports them, and `npm run build` writes that module to `dist/index.js` with declarations in `dist/index.d.ts`. A page loads `browser/emoji-engine-magic.js` and gets `compile`, `Compiler`, `Lexer`, `Parser`, and `MagicError` on `EmojiEngineMagic` and on `Magic`.

The shapes are ordinary TypeScript. Plain JavaScript calls the same methods.

## Language

[LANGUAGE.md](LANGUAGE.md) is the definition of Magic. The notes here are the contract the compiler implements.

A script is UTF-8 text in a `.magic` file. Keywords ignore case. Identifiers keep their case and are ASCII. `end` closes every block, including `try`. `then` and `do` are optional. A newline, `:`, or `;` ends a statement. `--` comments to the end of the line. A leading `REM` does too. `@name` and `@name(args)` are annotations. `@strict` and `@normal` set the file's checker. Types use `as`. In `@strict`, a class member may be `public`, `private`, or `protected`.

Indexes start at 0. `for i = 1 to 10` includes both ends. A negative `step` walks downward. `continue` still applies the step. `for item in value` yields list values, record keys, or string code points. `nil` yields nothing.

`nil`, `false`, `0`, and `""` are false. Every other value is true.

`=` assigns. Comparisons are `==`, `!=`, `<>`, `<`, `>`, `<=`, `>=`. `==` and `!=` are exact, the way `===` and `!==` are. `if a = b` throws `use == to compare. = assigns a value`. `and` and `or` return the operand they chose. `not a == b` is `not (a == b)`.

`..` and `&` join text, and `nil` joins as `""`. `mod` is remainder. `^` is power, right-associative, and tighter than a leading minus, so `-2^2` is `-4`. `#` is length.

Calls use parentheses. A name or a member followed by a string is a call with that string.

`fn name()` declares a function. `fn()` is a function value. `async fn` may `await`. `await` belongs in an `async fn` or at the top of a file. `fn new` cannot be `async`. `class` is only legal at the top level. `class Child is Parent` uses the word `is`. `fn new` is the constructor. `Child(1)` and `new Child(1)` both construct. Fields run parent-first, then `fn new`. `self` inside a method is that object, including from a nested function. `super()` runs the parent constructor. `super.method()` calls a parent method. `is` links Magic classes only. Engine classes are constructed with `new`.

`try` / `catch` / `finally` / `end` catch a thrown value. `catch name` binds it when the name is on the same line. `throw` raises an `Error`. A string becomes that error's message.

A parent class in the same file is written before the child. The message is `write class Parent before class Child`.

Every top-level `fn`, `class`, and `let` is exported. Imports are not exported again. `let` is optional on the first assignment. Locals are function-scoped. A second `let` of one name in the same function throws `is already declared`. A `for` may reuse a local or a parameter.

Imports are legal only at the top level:

```text
import Engine, Terminal from "2d"
import Engine as World from "3d"
import "2d" as sprites
import greet from "./words.magic"
import shout from "./helpers.js"
import default as twice from "./helpers.js"
import "./boot.magic"
```

`2d` and `emoji-engine-2d` are one package. `3d` and `emoji-engine-3d` are one package. `ui` and `emoji-engine-ui` are one package. `./witch` is a Magic file. A specifier that ends in `.js`, `.mjs`, `.cjs`, or `.json` is a JavaScript module next to the importer when the path is `./` or `../`. `import default as name` binds a JavaScript default export. A cycle throws `import cycle:` and the file names. A missing file throws `cannot find`.

An unknown name compiles to a property of `globalThis`. Builtins are real bindings: `print`, `len`, `str`, `num`, `int`, `type`, `keys`, `values`, `push`, `pop`, `time`, `error`, `sleep`, `load`. A function may shadow a builtin. Assigning to a builtin throws `is a Magic word`. Assigning to an import throws `is imported`. A JavaScript reserved word used as a binding throws `is reserved`. Property names and record keys may be reserved words. A name cannot start with `__magic`.

`print` with several values joins them with a tab. `print` alone writes a blank line. `type` returns `nil`, `number`, `string`, `bool`, `fn`, `list`, `record`, or a constructor name other than `Object`. `time` is milliseconds since the epoch. `num` and `int` return `nil` for text that is not a number. `push` and `pop` throw unless the value is a list. `pop` of an empty list is `nil`. `error(message)` returns an `Error`. `sleep(ms)` returns a promise. `load(url)` returns a promise for text or JSON. A failed load throws `cannot load`.

`break` or `continue` outside a loop throws `belongs inside a for, while, or repeat`. The same inside a nested function throws, because a nested function is not in the loop. `return` outside a function throws `return belongs inside a fn`. `self` outside a class throws `self belongs inside a class`. `super` without a parent throws `super needs a parent`.

## Compile

```ts
interface CompileOptions {
  filename?: string;
  target?: 'module' | 'script';
  resolve?: (specifier: string) => string;
  prelude?: string;
  strict?: boolean;
}

interface CompiledImport {
  specifier: string;
  resolved: string;
  kind: 'engine' | 'magic' | 'js';
  engine: '2d' | '3d' | 'ui' | null;
  form: 'side' | 'namespace' | 'named';
  alias: string | null;
  names: { imported: string; local: string }[];
}

interface CompileResult {
  code: string;
  exports: string[];
  imports: CompiledImport[];
  strict: boolean;
}

function compile(source: string, options?: CompileOptions): CompileResult;
function fileIsStrict(program: Program, fallback?: boolean): boolean;
function checkProgram(program: Program, filename: string, strict: boolean): void;
```

`target` defaults to `'module'`. `'script'` wraps one classic script.

`strict` defaults to false. `@strict` in the file turns the checker on. `@normal` turns it off. The file annotation wins over the option. Types and access are erased in `code`. `CompileResult.strict` is true when the checker ran. A script that imports another Magic file throws `this script imports another Magic file. Use magic run, or magic compile -o`. A script that imports a JavaScript file throws `this script imports a JavaScript file. Use magic run, or magic compile -o`. A script import that is not `2d`, `3d`, or `ui` throws `is not 2d, 3d, or ui`.

`resolve` rewrites import specifiers for a module. The default keeps an engine's package name and turns `.magic` into `.js`. `prelude` is the prelude import, default `./magic-std.js`.

`Compiler` has the same `compile`. `emitBody(program, { filename, bindings, strict })` returns `{ code, exports }` for one file inside a bundle. `bindings` are `{ local, expr }` pairs the bundler already has in scope. `hasTopLevelAwait(program)` is true when the file awaits outside a function.

`defaultResolve(specifier)` is that default rewrite.

## Bundle

```ts
interface BundleOptions {
  target?: 'module' | 'script';
  strict?: boolean;
}

interface BundleResult {
  code: string;
  exports: string[];
  engines: Array<'2d' | '3d' | 'ui'>;
  files: string[];
}

function bundle(entry: string, options?: BundleOptions): BundleResult;
```

`bundle` reads `entry` and every Magic file it reaches. `files` is those absolute paths, dependencies first, the entry last. `exports` are the entry's top-level names. `engines` lists the engines the graph imports, in the order 2d, 3d, ui.

`target: 'module'` is one ES module. Engine imports use the package names. Other external specifiers stay as imports. The entry's exports are re-exported.

`target: 'script'` is one classic script. Engines are read from `EmojiEngine`, `EmojiEngine3D`, and `EmojiEngineUI`. A missing global throws `emoji-engine-2d is not loaded` (or the 3d or ui package name) when the script runs. Relative `.js` / `.json` files are inlined. An external package that is not an engine throws `is not a Magic file, a JS file, or an emoji engine, so one script cannot pack it`.

## Runtime

```ts
interface RuntimeOptions {
  root?: string;
  outDir?: string;
  strict?: boolean;
}

type MagicModule = Record<string, unknown>;

class Runtime {
  readonly root: string;
  readonly outDir: string;
  constructor(options?: RuntimeOptions);
  runFile(file: string): Promise<MagicModule>;
  run(source: string, filename?: string): Promise<MagicModule>;
}
```

`root` resolves relative paths and defaults to the current directory. `outDir` stores generated modules and defaults to a fresh directory under the system temp directory. Every `run` and `runFile` writes a new subdirectory and imports it with a cache-busting query, so a second run sees new source.

`runFile` reads a file. `run` uses the string you pass. `filename` defaults to `main.magic`. Imports in that string still resolve next to `filename`, and those files are read from disk unless you are running a file that is already there.

The promise resolves to the module namespace of the entry. Top-level `fn`, `class`, and `let` names are the properties.

Engine imports load the installed package, or `../emoji-engine-2d/dist/index.js` (and the 3d and ui siblings) when the package is not installed. A missing engine throws `cannot find emoji-engine-2d. Install it next to emoji-engine-magic.` with that package's name.

## App

```ts
interface PackOptions {
  out?: string;
  name?: string;
  title?: string;
  width?: number;
  height?: number;
}

interface PackResult {
  dir: string;
  engines: Array<'2d' | '3d' | 'ui'>;
}

class App {
  static pack(entry: string, options?: PackOptions): PackResult;
}
```

`pack` writes an Electron project for `entry` and returns when the files are on disk. It does not install Electron and does not start a window.

`name` becomes the package name: lower case, with runs of other characters turned into one `-`. The default is the script's file name. `title` defaults to that name. `width` defaults to 960 and `height` to 720. Both need to be positive numbers. `out` defaults to `build/<name>`.

The folder receives `package.json` (`"type": "module"`, `"main": "main.js"`, start script `electron .`, devDependency `electron` `^33`), `main.js`, `index.html`, `game.js`, `README.md`, and `engines/` for each engine the script imports. `main.js` opens a `BrowserWindow` with `contextIsolation` true, `nodeIntegration` false, and `sandbox` true. On `window-all-closed` it quits, except on macOS, where `activate` opens a window again if none are open.

A missing `browser/emoji-engine-2d.js` (or the 3d or ui file) throws `cannot find browser/emoji-engine-2d.js. Run npm run build in emoji-engine-2d.`

## Errors

```ts
class MagicError extends Error {
  readonly line: number;
  readonly column: number;
  readonly filename: string;
  format(): string;
}
```

`line` and `column` start at 1. `format()` returns `file:line:column message`, or `line:column message` when the file name is empty. The `magic` command prints that and exits 1.

## Lexer and parser

```ts
class Lexer {
  constructor(source: string, filename?: string);
  tokenize(): Token[];
}

class Parser {
  constructor(filename?: string);
  parse(source: string): Program;
}
```

`Token` is `{ kind, value, line, column }`. `kind` is `eof`, `newline`, `ident`, `number`, `string`, `keyword`, or `op`. `@` is an `op`. `Program` is the tree the compiler accepts. It has `annotations` for file-level marks that were not attached to a statement. Application code usually calls `compile` and leaves the tree alone.

The `magic` command also accepts `--strict` on `run` and `compile`. `msx` and `js2magic` are documented in [tools/README.md](tools/README.md).

An unclosed string throws `this string never ends`. A string broken by a newline throws `a string has to end on the same line`. A missing `end` throws `expected end`.
