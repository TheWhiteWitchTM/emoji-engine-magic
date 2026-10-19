# js2magic

`js2magic` reads a `.js` or `.ts` file and writes Magic. The result is a first draft you can run and then tidy. It is not a full JavaScript implementation.

```bash
js2magic game.js
js2magic game.ts -o game.magic
js2magic game.ts --strict
```

With no `-o`, the Magic goes to stdout.

## What it turns into Magic

| JavaScript / TypeScript | Magic |
| --- | --- |
| `function greet(name) { ... }` | `fn greet(name)` / `end` |
| `class Box { constructor() {} }` | `class Box` / `fn new()` |
| `this.n` | `self.n` |
| `console.log(a, b)` | `print a, b` |
| `null`, `undefined` | `nil` |
| `===`, `!==` | `==`, `!=` |
| `&&`, `\|\|`, `!` | `and`, `or`, `not` |
| `const n = 1` | `let n = 1` |
| `for (const x of bag)` | `for x in bag` |
| `for (let i = 1; i <= 3; i++)` | `for i = 1 to 3` |
| `name: string` | `name as string` |
| `private n = 0` | `private n = 0` |
| `` `hi ${name}` `` | `"hi " .. name` |
| `import { x } from "./y"` | `import x from "./y.magic"` when `./y` was `.ts` or `.js` |

`boolean` becomes `bool`. `void` becomes `nil`. Array types become `list`. A class `extends` becomes `is`.

When the source had types or `private` / `public` / `protected`, the output starts with `@strict`. `--strict` puts `@strict` there even when the source had none.

## What you will still edit

The converter skips or comments things Magic does not have: destructuring, rest and spread as bindings, getters, static fields, `export default`, interfaces, enums, and most advanced TypeScript types.

A `switch` becomes `if` / `elseif`. A `do { } while (x)` becomes `repeat` / `until not (x)`. A `for` it cannot count out becomes a `while`.

Arrow functions become `fn()` values. `++` and `--` as statements become `+= 1` and `-= 1`.

Relative imports that ended in `.ts` or `.js` are rewritten to `.magic`. Package imports stay as they were.

Read the output, run it with `msx`, and fix the comments that start with `-- skipped`.
