# Changes

emoji-engine-magic is alpha, at package version 0.1.0. Entries here describe behavior a caller can observe. Until a release candidate, a later version may change any of this again. See the status note in [README.md](README.md).

## Unreleased

- `try` / `catch` / `finally` / `end` catch a thrown value. `catch err` binds it. `catch` alone binds nothing. `throw` raises an `Error`. A string becomes that error's message. `error(message)` builds an `Error` without throwing.
- `async fn` and `await` load assets and wait on promises. `await` belongs in an `async fn` or at the top of a file. `fn new` cannot be `async`. `sleep(ms)` pauses. `load(url)` reads text or JSON, from a URL or from a file next to the script under `magic run`.
- `import shout from "./helpers.js"` calls JavaScript functions. `import default as twice from "./mod.js"` binds a default export. A classic `function triple()` file exports that name. A `.json` object exports its keys. Existing Magic and engine imports are unchanged.

Magic is the first cut of the language. Scripts are `.magic` files. The compiler emits JavaScript. Keywords ignore case. Names keep their case. Indexes start at 0. `nil`, `false`, `0`, and `""` are false.

- `end` closes `if`, `while`, `for`, `repeat`, `fn`, and `class`. `then` and `do` are optional. A newline, `:`, or `;` ends a statement. `--` and a leading `REM` are comments.
- `=` assigns. `==` compares exactly. `<>` and `!=` are not-equal. `if a = b` is an error. `and` and `or` return the operand they chose. `not` binds looser than a comparison.
- `..` and `&` join text. `mod` is remainder. `^` is power and binds tighter than a leading minus, so `-2^2` is `-4`. `#` is length. `for i = 1 to 10` includes both ends. `continue` still applies `step`. `for item in` walks list values, record keys, or string code points.
- `fn name()` declares a function. `fn()` is a value. A call needs parentheses, except a name or member followed by a string. `let` is optional. Locals are function-scoped. Every top-level `fn`, `class`, and `let` is exported. Imports are not exported again.
- `class Child is Parent` and `fn new` define a Magic class. `Child()` and `new Child()` both construct. Fields run parent-first, then `fn new`. `self` is lexical. `super()` and `super.method()` reach the parent. `is` is for Magic classes. Engine classes use `new`.
- Builtins are `print`, `len`, `str`, `num`, `int`, `type`, `keys`, `values`, `push`, `pop`, `time`, `error`, `sleep`, and `load`. `print` joins values with a tab. An unknown name reads `globalThis`.
- Imports: `import Engine, Terminal from "2d"`, `import Engine as World from "3d"`, `import "ui" as kit`, `import greet from "./words.magic"`, `import shout from "./helpers.js"`, and `import "./boot.magic"`. `2d`, `3d`, and `ui` are the sibling engines. `./witch` is a Magic file. `./helpers.js` is JavaScript. A cycle is an error.
- `magic run` executes a graph on Node. `magic compile -o` writes one ES module with package imports for the engines. `magic app` writes an Electron project and copies the browser engine builds it needs. It does not install Electron. The window defaults to 960 by 720, with `contextIsolation`, no `nodeIntegration`, and `sandbox`.
- `compile(source, { target: 'script' })` writes one classic script for a page that loaded the engine browser builds. A script target that imports another Magic file is an error. The page global is `EmojiEngineMagic`, also available as `Magic`.
- `examples/demo.js` is the contract check. `examples/play.html` is the hunt in a browser. `examples/hunt.magic`, `examples/desk.magic`, `examples/witch.magic`, `examples/words.magic`, `examples/jsuse.magic`, `examples/helpers.js`, and `examples/plain.js` are the sample scripts.
