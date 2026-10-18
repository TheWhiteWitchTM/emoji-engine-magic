# Changes

emoji-engine-magic is alpha, at package version 0.1.0. Entries here describe behavior a caller can observe. Until a release candidate, a later version may change any of this again. See the status note in [README.md](README.md).

## Unreleased

Magic is the first cut of the language. Scripts are `.magic` files. The compiler emits JavaScript. Keywords ignore case. Names keep their case. Indexes start at 0. `nil`, `false`, `0`, and `""` are false.

- `end` closes `if`, `while`, `for`, `repeat`, `fn`, and `class`. `then` and `do` are optional. A newline, `:`, or `;` ends a statement. `--` and a leading `REM` are comments.
- `=` assigns. `==` compares exactly. `<>` and `!=` are not-equal. `if a = b` is an error. `and` and `or` return the operand they chose. `not` binds looser than a comparison.
- `..` and `&` join text. `mod` is remainder. `^` is power and binds tighter than a leading minus, so `-2^2` is `-4`. `#` is length. `for i = 1 to 10` includes both ends. `continue` still applies `step`. `for item in` walks list values, record keys, or string code points.
- `fn name()` declares a function. `fn()` is a value. A call needs parentheses, except a name or member followed by a string. `let` is optional. Locals are function-scoped. Every top-level `fn`, `class`, and `let` is exported. Imports are not exported again.
- `class Child is Parent` and `fn new` define a Magic class. `Child()` and `new Child()` both construct. Fields run parent-first, then `fn new`. `self` is lexical. `super()` and `super.method()` reach the parent. `is` is for Magic classes. Engine classes use `new`.
- Builtins are `print`, `len`, `str`, `num`, `int`, `type`, `keys`, `values`, `push`, `pop`, and `time`. `print` joins values with a tab. An unknown name reads `globalThis`.
- Imports: `import Engine, Terminal from "2d"`, `import Engine as World from "3d"`, `import "ui" as kit`, `import greet from "./words.magic"`, and `import "./boot.magic"`. `2d`, `3d`, and `ui` are the sibling engines. `./witch` is a Magic file. A cycle is an error.
- `magic run` executes a graph on Node. `magic compile -o` writes one ES module with package imports for the engines. `magic app` writes an Electron project and copies the browser engine builds it needs. It does not install Electron. The window defaults to 960 by 720, with `contextIsolation`, no `nodeIntegration`, and `sandbox`.
- `compile(source, { target: 'script' })` writes one classic script for a page that loaded the engine browser builds. A script target that imports another Magic file is an error. The page global is `EmojiEngineMagic`, also available as `Magic`.
- `examples/demo.js` is the contract check. `examples/play.html` is the hunt in a browser. `examples/hunt.magic`, `examples/desk.magic`, `examples/witch.magic`, and `examples/words.magic` are the sample scripts.
