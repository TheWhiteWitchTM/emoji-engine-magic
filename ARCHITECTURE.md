# Architecture

emoji-engine-magic is five pieces. Each one owns a single job. Application code is the only thing that may compose them.

```text
application
  ├─ App.pack(entry)     an Electron project
  └─ Runtime ── uses ──▶ Compiler ── uses ──▶ Parser ── uses ──▶ Lexer
```

| Piece | Owns | Leaves alone |
| --- | --- | --- |
| Lexer | Characters into tokens, including the newline | What a program means |
| Parser | Tokens into a tree | JavaScript |
| Compiler | One Magic file into JavaScript | Reading a folder, opening a window |
| Runtime | Running that JavaScript on Node | Packing Electron |
| App | The Electron project on disk | Playing the game |

The words `print` and `len` live in `src/std.ts` as plain JavaScript text. The compiler pastes that text, or imports it. It is not a sixth piece, and nothing imports it sideways except the compiler and the runtime.

Lexer, Parser, and Compiler do not import Runtime or App. The browser entry, `src/browser.ts`, exports the compiler and stops there, so a page can compile a script without a file system.

## Lexer

`src/lexer.ts` walks the source once. A newline is a token, because a new line ends a statement the way it does in BASIC. Spaces and tabs are skipped. `--` drops the rest of the line. `REM` does that only when it is the first word on the line, so `rem` later in a line can still be a name.

Keywords are matched without regard to case and stored in lower case. Names keep the case they were written in. `then`, `do`, `to`, `step`, `in`, `as`, `is`, and `mod` are not keywords. The parser accepts them where they belong in a phrase, and the names that JavaScript allows can still be variables.

Strings use `"` or `'`. They finish on the same line. Numbers are decimals, with a fraction and an exponent. `..` is one operator, so a range of dots is not a number.

## Parser

`src/parser.ts` is a recursive descent. `end` is the only closer. `then` and `do` may be left out. `else if` is a further arm when `if` is on the same line as `else`.

`=` is never a comparison. In `if`, `while`, `repeat`, and `until`, a following `=` is an error. Calls need parentheses, except a name or a member with a string right after it.

A class body is fields and `fn` methods, and it is only legal at the top of a file. `fn new` is the constructor. `new` remains a keyword everywhere else. Imports are only legal at the top of a file.

Operators climb by precedence. `or`, then `and`, then comparisons, then `..` and `&`, then `+` and `-`, then `*`, `/`, `%`, and `mod`, then a leading minus, `#`, and `^`. `^` associates to the right and binds tighter than a leading minus. `not` binds looser than a comparison.

## Compiler

`src/compiler.ts` walks the tree twice. The first walk finds every local in a function before it looks inside nested functions, so an assignment creates a function-scoped local even when the assignment sits below a nested function. The second walk compiles nested functions.

Every top-level `fn`, `class`, and `let` is exported from a module. Imports are not exported again. A `let` is hoisted to the top of its function, uninitialized, then assigned where it was written. Inside one module, `export let` is the same idea.

An unknown name becomes `globalThis.name`. The name `globalThis` itself stays `globalThis`. Builtins become the `__magic_` functions from the prelude, so a script that declares `fn len` does not collide with the prelude. The name `type` would be illegal in `import { type }`, so the call is `__magic_type`.

`print` as a statement calls `__magic_print`. `==` becomes `===`, and `<>` or `!=` becomes `!==`. `..` and `&` call `__magic_cat`. `^` is `Math.pow`. `#` is `__magic_len`. `and` and `or` are `&&` and `||`.

A numeric `for` is a JavaScript `for`. The step sits in the update slot, so `continue` still moves the counter. The end and the step are read once, before the loop. A negative step compares with `>=`. `for item in` uses `__magic_iter`. `repeat` is `do ... while (!(test))`.

Assignment to a member or an index reads the object, and the index, once. A free function assignment to a builtin, an import, a function, or a class is an error.

A class compiles to a function. Calling it without `new` uses `Reflect.construct`, so `Counter(2)` and `new Counter(2)` are the same. `new Engine(...)` stays a real `new`, because that is what the engines expect. The prototype is replaced with `Object.create(parent.prototype)` before methods are stored. Field initializers run parent-first through `__magic_inits`. `fn new` is stored as `prototype.__magicNew` and is the only constructor that runs. `super()` calls the parent `__magicNew`. A method takes `self` once, as a local, and nested functions close over that local.

A module import is a real ESM import. The default resolver turns `2d` into `emoji-engine-2d` and `./witch.magic` into `./witch.js`. A script import of an engine reads `globalThis.EmojiEngine`, `globalThis.EmojiEngine3D`, or `globalThis.EmojiEngineUI`. A script that imports another Magic file is an error. The bundler is what inlines those files.

## Runtime

`src/runtime.ts` loads the import graph, writes one ES module per Magic file plus `magic-std.js`, and dynamic-imports the entry. Each run gets a new directory, because Node caches modules by URL. The directory has `"type": "module"` so those `.js` files are modules even under the system temp folder.

Engine imports in that directory are absolute `file:` URLs. Node would not resolve `emoji-engine-2d` from a file in `/tmp`. The URL comes from this package's dependency, or from the sibling `dist/index.js` when the dependency is not installed. Magic imports in the same graph are flat siblings, so `lib/witch.magic` becomes `lib__witch.js`.

## App

`src/app.ts` asks the bundler for one classic script, then writes an Electron project: `package.json`, `main.js`, `index.html`, `game.js`, and a short README. Browser builds of the engines the graph imports are copied into `engines/`. A missing browser build names the engine and asks for `npm run build` there. Files already in the output folder, other than the ones Magic writes, are left in place. Electron is not downloaded.

`src/bundle.ts` is the piece Runtime does not use. `magic compile` and `App.pack` do. It inlines every Magic file, pastes the prelude once, and orders files so a dependency runs before the file that imports it.

`src/cli.ts` is the `magic` command. It prints a `MagicError` as `file:line:column message` and exits 1.

## Source map

```text
src/lexer.ts       tokens
src/parser.ts      the tree
src/compiler.ts    one file of JavaScript
src/std.ts         prelude text
src/runtime.ts     run a graph on Node
src/bundle.ts      one file for a whole graph
src/app.ts         Electron project
src/cli.ts         the magic command
src/graph.ts       read imports, in dependency order
src/locate.ts      this package, and the sibling engines
src/engines.ts     2d, 3d, ui names and globals
src/browser.ts     compiler exports for a page
src/index.ts       public re-exports
dist/              JavaScript modules and declarations
browser/           script-tag bundle and its minified build
examples/demo.js   the contract check
examples/play.html the hunt in a browser
```

`package.json` is `"type": "module"`. `tsconfig.json` targets ES2022, uses NodeNext, and includes the Node types only, so the compiler stays free of the DOM. `npm run build` compiles `src/` to `dist/`, then bundles `browser/emoji-engine-magic.js` and `browser/emoji-engine-magic.min.js`. The page global is `EmojiEngineMagic`, also stored as `Magic`.

Import `emoji-engine-magic` or `./dist/index.js` from an ES module. A classic page loads `browser/emoji-engine-magic.js`.
