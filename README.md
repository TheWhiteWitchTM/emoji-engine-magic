# emoji-engine-magic

**Alpha.** This is alpha-level code. Public interfaces and behavior can change between versions, and a change can break callers. Use it at your own risk.

A release candidate is the point where the public interfaces freeze. Until then, treat [INTERFACES.md](INTERFACES.md) as a description of the code you have, and read [CHANGES.md](CHANGES.md) before you upgrade.

Magic is a small language for games. It looks like BASIC and Lua, and it compiles to JavaScript. A script can import emoji-engine-2d, emoji-engine-3d, and emoji-engine-ui. `magic run` runs it. `magic app` turns it into an Electron project.

## Install and run the demo

```bash
npm install
npm run demo
```

`npm install` compiles `src/` into `dist/` and writes the script-tag build to `browser/`. `npm run build` does that again after you change the TypeScript. The demo imports the built files with Node, so it does not need a TypeScript loader. It runs a language check, a headless Witch Hunt on the 2D engine, a small desk on the UI kit, and packs an Electron folder. It prints `demo ok`.

Under Node the hunt installs the 2D engine's DOM stand-in so a canvas can be constructed. Browsers already have `document` and `requestAnimationFrame`.

The same scene is in `examples/play.html`. From the folder that contains the engines:

```bash
python3 -m http.server 8765
```

Open `http://localhost:8765/emoji-engine-magic/examples/play.html`. Run `npm run build` in this package and in emoji-engine-2d first. Arrow keys steer the witch. The footer reads `browser ok` after the first frame.

## Commands

```bash
npm run magic -- run examples/hunt.magic
npm run magic -- compile examples/check.magic -o game.js
npm run magic -- app examples/hunt.magic -o build/witch-hunt --title "Witch Hunt"
```

`node dist/cli.js` is the same program. A project that depends on this package gets a `magic` command.

`magic compile` writes one JavaScript module. Magic files that the script imports are copied into that module. An engine import stays a package import: `emoji-engine-2d`, `emoji-engine-3d`, or `emoji-engine-ui`.

`magic app` writes a folder. The window is 960 by 720 unless `--width` and `--height` say otherwise. The folder's `package.json` depends on Electron. Magic does not install it.

```bash
cd build/witch-hunt
npm install
npm start
```

The page loads the engine browser builds the script imports, then `game.js`. The window keeps `contextIsolation` on, `nodeIntegration` off, and `sandbox` on.

## A game

```
import Engine, Utilities from "2d"

let engine = new Engine({ width: 480, height: 270 })
let ui = Utilities.wrap(engine.canvas, { title: "Witch Hunt" })
document.body.appendChild(ui.wrap)

let witch = engine.sprite("🧙‍♀️", 240, 135, 48)
let hunter = engine.sprite("✝️", 48, 135, 36, "entities")
engine.motion(hunter, 2, 0)

fn frame()
  if engine.isKeyDown("ArrowRight") then
    witch.x = witch.x + 4
  end
  engine.update()
  engine.canvas.draw()
  requestAnimationFrame(frame)
end

requestAnimationFrame(frame)
```

`document` and `requestAnimationFrame` are not Magic words. An unknown name is read from `globalThis`, so the same script runs in Node and in the browser. `Engine` came from the import, so that name is the class.

A game that steers owns the loop: `engine.update()`, then `engine.canvas.draw()`. `examples/hunt.magic` does that in a `for` loop so it can run headless. `examples/play.html` does it with `requestAnimationFrame`.

## Language

[LANGUAGE.md](LANGUAGE.md) defines the language: every form, every rule, and every built-in word. This section is the short tour.

A script is a `.magic` file. Keywords ignore case. Names keep their case. A newline ends a statement. `:` and `;` do the same job when two statements share a line. `--` comments out the rest of the line. `REM` does that too, when it is the first word on the line.

`end` closes `if`, `while`, `for`, `repeat`, `fn`, and `class`. `then` and `do` are optional.

```
if score > 0 then
  print "yes"
elseif score == 0 then
  print "zero"
else
  print "no"
end

while n < 4
  n = n + 1
end

repeat
  n = n + 1
until n == 4

for i = 1 to 3
  total = total + i
end

for i = 3 to 1 step -1
  print i
end

for item in bag
  print item
end
```

`else if` on one line is another arm, the same as `elseif`.

`=` assigns. A comparison is `==`. Writing `if a = b` is an error that tells you to use `==`. `<>` and `!=` both mean not equal. `<`, `>`, `<=`, and `>=` compare numbers the way JavaScript does. `and` and `or` give back the value they chose, the way `&&` and `||` do. `not a == b` means `not (a == b)`.

`nil`, `false`, `0`, and `""` are false. Every other value is true.

Numbers are JavaScript numbers. `"hi"` and `'hi'` are strings. Escapes are `\n`, `\r`, `\t`, `\0`, `\\`, `\'`, `\"`, and `\u{1F9D9}`. A list is `[1, 2]`. A record is `{ name: "Ada", hp: 3 }`. Indexes start at 0, so `bag[0]` is the first item. `for i = 1 to 3` visits 1, 2, and 3. `step` may be negative, and `continue` still applies that step. `for item in bag` walks the values of a list, the keys of a record, and the code points of a string. `nil` yields nothing.

`..` and `&` both join text. `nil` joins as empty text. `mod` is the remainder, so `10 mod 3` is 1. `^` is power. It binds tighter than a leading minus, so `-2^2` is `-4`. `#bag` is the length. `#` on a string counts code points.

```
print "Hello", name
print
print greet "Ada"
```

`print` writes one line. Several values are joined with a tab. `print` alone writes a blank line. A call needs parentheses, except a name or a member followed by a string: `greet "Ada"` is `greet("Ada")`.

```
fn greet(name)
  return "Hello, " .. name
end

let twice = fn(x)
  return x * 2
end
```

`fn name()` declares a function. `fn(x)` is a function value, for callbacks and for `let`. `return` belongs inside a function. `break` and `continue` belong inside `for`, `while`, or `repeat`.

`let` is optional. The first assignment to a new name creates a local. Locals belong to the whole function, not to the block they sit in. A second `let` of the same name in that function is an error. A `for` may use a name that already exists. Assigning to `print`, to an import, or to a function is an error.

```
class Box
  n = 0
  fn new(start)
    self.n = start
  end
  fn label()
    return "n=" .. self.n
  end
end

class Counter is Box
  extra = 1
  fn new(start)
    super(start)
  end
  fn bump()
    let inner = fn()
      return self.n
    end
    self.n = inner() + 1
    return self.n
  end
end

let box = Counter(2)
print box.bump()
print box.label()
```

`fn new` is the constructor. `Counter(2)` and `new Counter(2)` both build one. Fields are filled on the parent first, then on the child, and then `fn new` runs. A child that defines `fn new` calls `super(...)` to run the parent constructor. `self` is the object, including inside a function nested in a method. `super.label()` calls a parent method. `is` links Magic classes. Write the parent above the child in the same file.

Engine classes stay JavaScript classes. Build them with `new`:

```
let engine = new Engine({ width: 480, height: 270 })
let term = new Terminal({ cols: 40, rows: 12, showCursor: false })
let app = new Application(term, { sound: false })
```

These names already exist: `print`, `len`, `str`, `num`, `int`, `type`, `keys`, `values`, `push`, `pop`, `time`.

- `len(value)` and `#value` are the length. `nil` has length 0.
- `str` turns a value into text. `nil` becomes `""`.
- `num` reads a number. `int` drops the fraction. Text that is not a number becomes `nil`.
- `type` returns `nil`, `number`, `string`, `bool`, `fn`, `list`, or `record`. Another object returns its class name, so a Magic counter returns `Counter` and an engine sprite returns its JavaScript class.
- `keys` and `values` read a record. `values` of a list is a copy.
- `push` adds to a list and returns the item. `pop` removes the last item. An empty list pops `nil`. Both require a list.
- `time` is `Date.now()`, in milliseconds.

A function of your own may reuse one of those names. Inside that function, the name is yours.

```
import Engine, Terminal, Utilities from "2d"
import Engine as World from "3d"
import Application, Window, Button, Label from "ui"
import greet from "./words.magic"
import "2d" as sprites
import "./boot.magic"
```

`2d` and `emoji-engine-2d` are the same package. So are `3d` and `emoji-engine-3d`, and `ui` and `emoji-engine-ui`. `import "2d" as sprites` keeps the whole module under one name. `import "./boot.magic"` runs that file and keeps nothing. `./witch` means `witch.magic` next to the importer. `./notes.js` is JavaScript, left as a real import.

Imports sit at the top level. They are visible through the whole file. Every top-level `fn`, `class`, and `let` is exported. An import is not exported again. Two files that import each other are an error.

`examples/words.magic` is a one-function library. `examples/witch.magic` is the class the hunt imports. `examples/desk.magic` paints a window through emoji-engine-ui onto a 2D terminal. Constructing the 3D engine needs WebGL, so the language check only imports that `Engine`.

## From JavaScript

```js
import { compile, Runtime, App } from 'emoji-engine-magic';

const runtime = new Runtime();
await runtime.runFile('examples/hunt.magic');

const packed = App.pack('examples/hunt.magic', {
  out: 'build/witch-hunt',
  title: 'Witch Hunt',
});

const script = compile(source, { filename: 'play.magic', target: 'script' });
new Function(script.code)();
```

`compile` turns one script into a module, or into a classic script when `target` is `'script'`. A classic script can import `2d`, `3d`, and `ui`. It reads the globals those browser builds set: `EmojiEngine`, `EmojiEngine3D`, and `EmojiEngineUI`. Another `.magic` file is left for `magic run` and `magic compile -o`, which inline the whole graph.

A page loads `browser/emoji-engine-magic.js` and calls `EmojiEngineMagic.compile`, or `Magic.compile`. That build is the compiler only.
