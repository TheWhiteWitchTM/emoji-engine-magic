# Changes

emoji-engine-magic is alpha. This file is the version history. The package version is 0.2.0. Until a release candidate, a later version may change any of this again. See the status note in [README.md](README.md).

## 0.2.0

- `@name` and `@name(args)` are annotations. They sit above a statement, or alone at the top of a file, and they stay out of the way of ordinary Magic. Unknown names are kept and ignored. `@note("...")` is the usual remark.
- `@strict` runs the compiler in strict mode for that file. `@normal` turns it off. The default is normal, so existing scripts are unchanged. `compile`, `bundle`, `Runtime`, `magic run`, `magic compile`, and `msx` also take `strict` / `--strict`. A file annotation wins over the flag.
- In a `@strict` class, a field or method may be `public`, `private`, or `protected`. The default is public. `private` is only for that class. `protected` is for that class and its children. The check is at compile time. The JavaScript still stores ordinary properties.
- Optional types use `as`, so `:` can keep ending a statement. `let hp as number = 3`, `fn greet(name as string) as string`, `n as number = 0` on a field. Types are hints. Untyped names stay free. `nil` still fits anywhere. The checker only reports the obvious mismatches: a string in a number, a call on a number, `push` on a number, a private field read from outside.
- Builtin type names are `any`, `number`, `string`, `bool`, `fn`, `list`, `record`, `nil`. `boolean` and `int` mean `bool` and `number`. Any other name is a class type. A child value fits a parent type.
- `msx` runs a `.magic` file the way `tsx` runs TypeScript: `msx game.magic`, `msx -e 'print 1'`, `msx --watch game.magic`, or `msx` for a REPL. See [tools/msx.md](tools/msx.md).
- `js2magic` turns JavaScript or TypeScript into a first-draft Magic script. See [tools/js2magic.md](tools/js2magic.md).
- `examples/strict.magic` is a small strict class. `examples/sample.ts` is a converter sample.

## 0.1.0

Magic is the first cut of the language. Scripts are `.magic` files. The compiler emits JavaScript. Keywords ignore case. Names keep their case. Indexes start at 0. `nil`, `false`, `0`, and `""` are false.

- `end` closes `if`, `while`, `for`, `repeat`, `fn`, `class`, and `try`. `then` and `do` are optional. A newline, `:`, or `;` ends a statement. `--` and a leading `REM` are comments.
- `=` assigns. `==` compares exactly. `<>` and `!=` are not-equal. `if a = b` is an error. `and` and `or` return the operand they chose. `not` binds looser than a comparison.
- `..` and `&` join text. `mod` is remainder. `^` is power and binds tighter than a leading minus, so `-2^2` is `-4`. `#` is length. `for i = 1 to 10` includes both ends. `continue` still applies `step`. `for item in` walks list values, record keys, or string code points.
- `fn name()` declares a function. `fn()` is a value. A call needs parentheses, except a name or member followed by a string. `let` is optional. Locals are function-scoped. Every top-level `fn`, `class`, and `let` is exported. Imports are not exported again.
- `class Child is Parent` and `fn new` define a Magic class. `Child()` and `new Child()` both construct. Fields run parent-first, then `fn new`. `self` is lexical. `super()` and `super.method()` reach the parent. `is` is for Magic classes. Engine classes use `new`.
- `try` / `catch` / `finally` / `end` catch a thrown value. `catch err` binds it. `catch` alone binds nothing. `throw` raises an `Error`. A string becomes that error's message. `error(message)` builds an `Error` without throwing.
- `async fn` and `await` load assets and wait on promises. `await` belongs in an `async fn` or at the top of a file. `fn new` cannot be `async`. `sleep(ms)` pauses. `load(url)` reads text or JSON, from a URL or from a file next to the script under `magic run`.
- Builtins are `print`, `len`, `str`, `num`, `int`, `type`, `keys`, `values`, `push`, `pop`, `time`, `error`, `sleep`, and `load`. `print` joins values with a tab. An unknown name reads `globalThis`.
- Imports: `import Engine, Terminal from "2d"`, `import Engine as World from "3d"`, `import "ui" as kit`, `import greet from "./words.magic"`, `import shout from "./helpers.js"`, `import default as twice from "./mod.js"`, and `import "./boot.magic"`. `2d`, `3d`, and `ui` are the sibling engines. `./witch` is a Magic file. `./helpers.js` is JavaScript. A cycle is an error. A classic `function triple()` file exports that name. A `.json` object exports its keys.
- `magic run` executes a graph on Node. `magic compile -o` writes one ES module with package imports for the engines. `magic app` writes an Electron project and copies the browser engine builds it needs. It does not install Electron. The window defaults to 960 by 720, with `contextIsolation`, no `nodeIntegration`, and `sandbox`.
- `compile(source, { target: 'script' })` writes one classic script for a page that loaded the engine browser builds. A script target that imports another Magic file is an error. The page global is `EmojiEngineMagic`, also available as `Magic`.
- `examples/demo.js` is the contract check. `examples/play.html` is the hunt in a browser. `examples/hunt.magic`, `examples/desk.magic`, `examples/witch.magic`, `examples/words.magic`, `examples/jsuse.magic`, `examples/helpers.js`, and `examples/plain.js` are the sample scripts.
