# Magic

Magic is the language of emoji-engine-magic. A program is a UTF-8 `.magic` file. The shape is BASIC and Lua. The compiler turns it into JavaScript, so a script can call emoji-engine-2d, emoji-engine-3d, emoji-engine-ui, and the browser.

This file is the language. [README.md](README.md) covers install, `magic run`, and `magic app`. [INTERFACES.md](INTERFACES.md) covers the compiler, the runtime, and the packager. The language is alpha: a later version may change a rule on this page.

```
REM A counter, to show the shape of a script.

class Counter
  n = 0

  fn new(start)
    self.n = start
  end

  fn bump()
    self.n = self.n + 1
    return self.n
  end
end

let counter = Counter(1)
print counter.bump()
```

`end` closes every block, including `try`. A newline ends a statement. `Counter(1)` and `new Counter(1)` build the same object.

## Text

A leading byte-order mark is ignored. Spaces and tabs separate words. A newline ends a statement, and so do `:` and `;`.

```
print "one" : print "two"
print "three"; print "four"
```

Inside `()`, `[]`, `{}`, after a comma, and after an operator, a newline is only spacing. The statement continues.

`--` comments out the rest of the line. `REM` does the same when it is the first word on the line and the character after it is not a letter, digit, or `_`. `REM` ignores case. `remember = 1` is an assignment.

`@name` is an annotation. It sits above a statement, or alone at the top of a file. See [Annotations](#annotations).

## Names and words

A name starts with a letter or `_`, then letters, digits, and `_`. Names keep their case, so `hp` and `HP` are different. Keywords ignore case, so `IF`, `If`, and `if` are the same word. This file writes keywords in lower case.

A name cannot start with `__magic`. That prefix belongs to the compiler.

These words are structure. They cannot be variable names, parameters, functions, or classes.

| Word | Role |
| --- | --- |
| `import`, `from` | Modules |
| `fn`, `return`, `end` | Functions |
| `class`, `new`, `self`, `super` | Classes |
| `let` | A declared local |
| `if`, `then`, `else`, `elseif` | A choice |
| `for`, `while`, `repeat`, `until` | Loops |
| `break`, `continue` | Leave or skip a loop |
| `try`, `catch`, `finally`, `throw` | Errors |
| `await` | Wait for a value |
| `and`, `or`, `not` | Logic |
| `true`, `false`, `nil` | Values |
| `print` | The print statement |

These words are names, and they are also part of one phrase. Outside that phrase they are ordinary names, except `do` and `in`, which JavaScript reserves.

| Word | Where the phrase takes it |
| --- | --- |
| `do` | Optional after `while` and `for` |
| `to`, `step` | `for i = 1 to 10 step 2` |
| `in` | `for item in bag` |
| `as` | `import Engine as World from "2d"`, and a type: `let hp as number` |
| `is` | `class Child is Parent` |
| `mod` | Remainder between two values: `10 mod 3` |
| `async` | Optional before `fn`: `async fn load()` |
| `public`, `private`, `protected` | A class field or method, in `@strict` |

`mod` between two values is the operator, even when a variable named `mod` exists. The variable is what you get in a value position: `print mod`.

Magic compiles to JavaScript, so these names cannot be bindings. They can still be record keys and property names.

`await`, `arguments`, `break`, `case`, `catch`, `class`, `const`, `continue`, `debugger`, `default`, `delete`, `do`, `else`, `enum`, `eval`, `export`, `extends`, `false`, `finally`, `for`, `function`, `if`, `implements`, `import`, `in`, `instanceof`, `interface`, `let`, `new`, `null`, `package`, `private`, `protected`, `public`, `return`, `static`, `super`, `switch`, `this`, `throw`, `true`, `try`, `typeof`, `undefined`, `var`, `void`, `while`, `with`, `yield`.

Magic already rejects most of those as keywords. The ones Magic would otherwise allow, such as `default`, `null`, `undefined`, and `typeof`, fail with `is reserved`.

## How a name is found

Magic looks for a name in this order:

1. A parameter, local, function, or class in the current function.
2. The same kinds of names in each function outside that, out to the file.
3. An import in this file.
4. A built-in word: `len`, `str`, `num`, `int`, `type`, `keys`, `values`, `push`, `pop`, `time`, `error`, `sleep`, `load`.
5. A property of `globalThis`.

`globalThis` itself is the JavaScript global object. `document`, `Math`, and `requestAnimationFrame` are found in step 5. An unknown name that is missing there is an empty value.

Assignment follows a stricter rule. The first assignment to a new name creates a local in the current function, or at the top of the file. Magic will not assign over an import, a function, a class, or a built-in word. Writing `score = 1` stores a local. It does not store `globalThis.score`. To write a global property, assign the property: `globalThis.marker = 9`.

A local belongs to the whole function, including the lines above the assignment and the functions nested inside it. Until the assignment runs, the local is empty. A nested function sees the value from the moment of the call.

```
fn nested_see()
  let inner = fn()
    return score
  end
  score = 5
  return inner()
end
```

`nested_see()` is `5`. A call to `inner()` placed above `score = 5` would see an empty `score`.

A second `let` of the same name in that function is the error `is already declared`. The two `let`s can sit in different `if` arms and still clash, because the name covers the function. A `for` may reuse a local or a parameter.

`let` may omit the value. The name exists and stays empty until something assigns it. In `@strict`, a `let` may also name a type with `as`. See [Types](#types).

```
let score
score = 1
```

The first assignment can omit `let`. These two are the same local:

```
let score = 1
score = 1
```

At the top of a file, every `fn`, `class`, and `let` is exported, including a local that was created by a bare assignment. An import is not exported again. A local inside a function stays in that function.

Assigning to a built-in reports `is a Magic word`. Assigning to an import reports `is imported`. Assigning to a function reports `is a function`. Assigning to a class reports `is a class`.

A function of your own may reuse a built-in name. Inside that function, the name is yours. `print` is a keyword, so it cannot be reused. The other built-ins can.

```
fn show(len)
  return len
end

print show(4)
print len("ab")
```

`show(4)` is `4`. The outer `len("ab")` is still the built-in, and the result is `2`.

## Values

`type(value)` returns a short name for the value.

| Value | Written | `type` |
| --- | --- | --- |
| Empty | `nil` | `nil` |
| Number | `1`, `2.5`, `.5`, `1e2` | `number` |
| Text | `"hi"`, `'hi'` | `string` |
| Boolean | `true`, `false` | `bool` |
| Function | `fn ()` or `fn name()` | `fn` |
| List | `[1, 2]` | `list` |
| Record | `{ name: "Ada" }` | `record` |
| Class instance | `Counter(1)` | the class name, such as `Counter` |
| Engine object | a sprite, a terminal | that object's JavaScript class name |

A missing field, a missing argument, and a local that has not been assigned are empty to `type`, `str`, `len`, and to a condition. `==` tells the literal apart from a hole: `nil == nil` is true, and `card.gone == nil` is false when `card` has no `gone`. `type(card.gone) == "nil"` is true for both.

### Truth

A condition is false for `nil`, a missing value, `false`, `0`, `""`, and `NaN`. Every other value is true. That includes every record, every list (empty or not), every function, every non-zero number, `Infinity`, and the text `"0"`.

`and` and `or` return the value they chose, and they skip the side they do not need.

| Expression | Result |
| --- | --- |
| `nil or "witch"` | `"witch"` |
| `0 or 5` | `5` |
| `"witch" and "hunter"` | `"hunter"` |
| `0 and "no"` | `0` |
| `false and side()` | `false`, and `side` is not called |
| `false or side()` | the call runs |

### Numbers

Numbers are JavaScript numbers. `10 / 4` is `2.5`. There is no separate integer type. `int` drops the fraction.

`01` is an error that tells you to write `1`. `0`, `0.5`, and `0e1` are fine. There are no hex or binary literals. A negative number is a value with a leading minus: `-2`.

`1 / 0` is `Infinity`. `0 / 0` is `NaN`. Both have type `number`. `num` turns both into `nil`. `NaN` is false in a condition. `Infinity` is true.

### Text

A string uses `"` or `'`. It ends on the same line. There is no interpolation. These escapes work:

| Escape | Character |
| --- | --- |
| `\n` | newline |
| `\r` | carriage return |
| `\t` | tab |
| `\0` | the zero character |
| `\\` | backslash |
| `\'` | single quote |
| `\"` | double quote |
| `\u00A9` | a code point from four hex digits |
| `\u{1F9D9}` | a code point from one to six hex digits |

An unknown escape is an error. A code point above `10FFFF` is an error.

`#` and `for item in text` count Unicode code points. `text[0]` uses a JavaScript index, which counts UTF-16 units. For an emoji above `U+FFFF` those two disagree. `# "🧙"` is `1`. `# "🧙‍♀️"` is `4`, because that witch is four code points joined by a zero-width joiner. Walk text with `for ch in text` when you want the code points.

### Lists

A list is `[1, 2, 3]`. A comma after the last item is allowed. `[]` is empty. The first item is `bag[0]`. An index past the end is empty. Assign an index to replace an item: `bag[0] = "witch"`.

`for item in bag` walks the items from first to last. `keys(bag)` is empty, because a list is not a record. Walk indexes with `for i = 0 to len(bag) - 1`.

A list is a JavaScript array. Magic's `push` and `pop` are the language's own words. The array also has JavaScript methods, and those methods have JavaScript results. `push(bag, item)` returns the item. A JavaScript `bag.push(item)` returns the new length.

### Records

A record is `{ name: "Ada", hp: 3 }`. Keys are names or strings. A comma after the last field is allowed. `{}` is empty.

```
let card = { name: "Ada", hp: 3 }
print card.name
print card["hp"]
```

A Magic keyword cannot be a dot name. Use a string and brackets: `row["if"]`. A JavaScript reserved word can be a dot name: `row.default`. A later field with the same key replaces the earlier one.

`for key in card` walks the record's own keys, in the order they were added. The value is `card[key]`. `keys(card)` is those keys as a list. `values(card)` is the values as a new list.

A missing key reads as empty. Assigning `card.mp = 4` adds a key. Setting a key to `nil` keeps the key. The value is empty, and `keys` still lists it.

A class instance is a record of its fields. `for key in box` walks the fields. Methods live on the class, so they are not keys.

## Operators

Tightest first. `^` groups to the right. The rest group to the left. `not` includes a comparison, so `not a == b` is `not (a == b)`.

| Operators | Example | Result |
| --- | --- | --- |
| call, `[]`, `.name` | `bag[0]` | the first item |
| `^` | `2 ^ 3 ^ 2` | `512` |
| `await`, leading `-`, `#` | `-2 ^ 2` | `-4` |
| `*`, `/`, `%`, `mod` | `10 mod 3` | `1` |
| `+`, `-` | `1 + 2 * 3` | `7` |
| `..`, `&` | `"a" .. 1 + 2` | `"a3"` |
| `==`, `!=`, `<>`, `<`, `>`, `<=`, `>=`, `not` | `not 1 == 2` | `true` |
| `and` | `1 and 2` | `2` |
| `or` | `nil or 2` | `2` |

`==` and `!=` compare exactly, the way JavaScript's `===` and `!==` do. `<>` is the same as `!=`. `"10" == 10` is false. `true == 1` is false. `<`, `>`, `<=`, and `>=` compare the way JavaScript does.

`=` assigns. It is not a comparison. In `if`, `while`, and `until`, a following `=` is the error `use == to compare. = assigns a value`.

`%` and `mod` are the remainder. The sign follows the left number, so `-10 mod 3` is `-1`.

`^` is power. It binds tighter than a leading minus, which is why `-2 ^ 2` is `-4` and `-(2 ^ 2)`.

`#value` is `len(value)`.

`..` and `&` join text. Each side is converted the way `str` converts it. `nil` joins as empty text, so `nil .. "a"` is `"a"`.

`+`, `-`, `*`, and `/` are JavaScript arithmetic. `+` joins text when either side is text, and on that path `nil` becomes the letters `null`. `nil .. "a"` is `"a"`. `nil + "a"` is `"nulla"`. `"hp=" + 3` is `"hp=3"`. Prefer `..` when you are building text.

### Assignment

These are statements. The right side is a value. One assignment per statement.

```
score = 1
score += 1
score -= 1
score *= 2
score /= 2
bag[0] += 1
card.hp += 2
```

`score += 1` means `score = score + 1`, and the same for `-=`, `*=`, and `/=`. For a property or an index, the object and the index are read once.

`+=` uses `+`. `nil += 1` becomes `1`, because the literal `nil` acts as zero in arithmetic. A local that has never been assigned is a hole, and `hole += 1` is `NaN`. Assign a number before you add to it.

The left side is a name, a property, or an index. `1 = 2` is the error `this cannot be assigned to`.

## Statements

A statement is one of these. A bare value on its own is the error `this value is unused. Call a function, or assign with =`. A call is a statement. `super(...)` is a statement. `await` is a statement. `throw` is a statement.

### if

```
if score > 0 then
  print "yes"
elseif score == 0 then
  print "zero"
else if false then
  print "later"
else
  print "no"
end
```

`then` is optional. `elseif` is one word. `else if` is another arm when `if` is on the same line as `else`. An `if` on the next line is a new statement inside the `else`. The arms are tried in order. The first true arm runs.

### while

```
while n < 4 do
  n = n + 1
end
```

`do` is optional. The test runs before the body. The body can run zero times. `continue` returns to the test.

### repeat

```
repeat
  n = n + 1
until n == 4
```

The body runs, then the test. The body runs at least once. The loop stops when the test is true. `continue` jumps to that test.

### for, counting

```
for i = 1 to 3
  total = total + i
end

for i = 3 to 1 step -1
  print i
end
```

`do` is optional. Both ends are visited. `for i = 1 to 3` visits `1`, then `2`, then `3`. `step` defaults to `1`. A negative step walks downward. `to` and `step` are read once, before the body. Changing them inside the loop leaves the end and the step as they were.

`continue` still applies the step. After the loop finishes, the counter sits one step past the end: `for i = 1 to 3` leaves `i` at `4`, and `for i = 3 to 1 step -1` leaves `i` at `0`. If the body never runs, the counter has still been set to the start. `for k = 1 to 0` leaves `k` at `1`.

A step of `0` does not move the counter. If the start already satisfies the test, the loop does not end.

The counter is a local of the function. A `for` may reuse a name that already exists.

### for, walking

```
for item in bag
  print item
end
```

| The value | What each step binds |
| --- | --- |
| list | the next item |
| record or class instance | the next own key |
| string | the next code point |
| `nil`, a number, a bool, a function | nothing |

When the walk produces nothing, the name keeps the value it had. After a walk that produced items, the name keeps the last one.

### try

```
try
  risky()
catch err
  print err.message
finally
  print "done"
end
```

`end` closes `try`. A `try` needs `catch`, `finally`, or both. `catch err` binds the thrown value to `err` when `err` sits on the same line as `catch`. `catch` alone catches and binds nothing.

```
try
  push(1, 2)
catch
  print "caught"
end

try
  work()
finally
  cleanup()
end
```

`err` is a function-scoped local, the same as a `for` counter. A `try` may reuse a name that already exists. After a catch that ran, the name keeps the error. After a catch that did not run, the name stays as it was.

`return`, `break`, and `continue` inside `try` still run `finally` before they leave, the way JavaScript does.

The caught value is a JavaScript `Error` when Magic threw it. Engine errors, `push`, and `pop` are the same kind of value. `err.message` is the text. `print err` writes `Error:` and that text.

### throw

```
throw "broke"
throw error("broke")
throw err
```

`throw` needs a value. A string, a number, or other text becomes an `Error` whose `message` is that text. An `Error` is thrown as it is. A record with a `message` field uses that field as the error text.

### print

```
print
print "Hello"
print "Hello", name
print greet("Ada")
```

`print` writes one line. Several values are converted with `str` and joined with a tab. `print` alone writes a blank line. `print` is a statement, so it cannot be stored in a variable or passed to a function.

### return, break, continue

`return` leaves the function. `return` alone returns an empty value. `return` outside a function is the error `return belongs inside a fn`.

`break` leaves the innermost `for`, `while`, or `repeat`. `continue` skips to the next turn of that loop. Either one outside a loop is the error `belongs inside a for, while, or repeat`. A function nested inside a loop is not in the loop, so `break` in that function is the same error.

## Functions

A named function is a statement. A function value is an expression.

```
fn greet(name)
  return "Hello, " .. name
end

let twice = fn(x)
  return x * 2
end

print greet("Ada")
print twice(5)
print greet "Ada"
```

`fn name(a, b)` declares `name` in the current function, or at the top of the file. `fn(a, b)` is a value. Writing a name on a function value is the error `a named fn is a statement. Here, write fn(x)`. Writing `fn()` as a statement, with no name, is the error `this function needs a name`.

`async fn name()` is a function that may `await`. `async fn()` is the function-value form. `async` is a word before `fn`. It can still be a variable name.

```
async fn ping()
  await sleep(10)
  return 1
end

let later = async fn()
  return await ping()
end

print await ping()
print await later()
```

`await` waits for a promise, then yields the value. A value that is not a promise is returned as it is. `await` belongs inside an `async fn`, or at the top of a file. `await` in a plain `fn` is the error `await belongs inside an async fn`.

`await` binds as tightly as a leading minus, so `await load() + 1` is `(await load()) + 1`.

A file may `await` at the top level, which is how a game loads assets before the loop starts:

```
let map = await load("map.json")
```

`fn new` cannot be `async`. The error is `fn new cannot be async`. An async method is fine.

Parameters are names in parentheses. A repeated parameter is `is already a parameter`. There are no default values and no rest parameter. A missing argument is empty. An extra argument is ignored. A comma after the last parameter, or the last argument, is allowed. In `@strict`, a parameter or a `fn` may add `as type`. See [Types](#types).

A call writes parentheses around the arguments. A name or a property followed by a string is a call with that one string: `greet "Ada"` is `greet("Ada")`, and `box.label "x"` is `box.label("x")`. Any other argument uses parentheses: `greet(name)`, `bag[0]("x")`.

A `fn name` written directly in a function, or at the top of the file, is available anywhere in that function or file, including above its own line. `greet` may call `twice` when `twice` is written further down. Write a top-level `fn` outside `if` and loops.

A `fn name` written inside `if`, `while`, `for`, or `repeat` is available in that block. Call it from inside the block.

A function value stored with `let` receives its value at that line. The name exists earlier, and a call before the line sees an empty local. Locals follow that same rule: the name covers the whole function, and the value arrives at the assignment.

A nested function keeps the locals of the function that contains it. A nested function inside a method keeps that method's `self` and `super`.

```
fn bump()
  let step = fn()
    self.n = self.n + 1
    return self.n
  end
  return step()
end
```

`step` still sees the object when you hand `step` to `requestAnimationFrame`. The method itself is different. `let step = box.bump` and then `step()` does not keep `box`, because `self` is chosen when the method runs. Wrap a method you want to pass on: `fn() box.bump() end`.

`len(fn)` is the number of parameters. A `fn()` value has length `0`. `str` of `fn greet` is `"greet"`. `str` of a function stored in a variable is that variable's name. `str` of a function value with no name is `"fn"`.

## Classes

Write a class at the top level of the file, outside `if` and loops. A class inside a function is the error `class belongs at the top of the script`.

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
    self.extra = self.n + self.extra
  end

  fn bump()
    self.n = self.n + 1
    return self.n
  end
end

let box = Counter(2)
print box.bump()
print box.label()
```

`class Child is Parent` sets the parent. `is` links Magic classes. Write the parent above the child in the same file. The error is `write class Parent before class Child`. An imported class may be a parent, because that file has already run.

The body holds fields and methods. A field is `name = value` or `let name = value`. The `let` changes nothing. The field needs `=` and a value. A method is `fn name(...)`. `fn new(...)` is the constructor. A field named `new` is the error `new is the constructor. Write fn new()`. A repeated field or method is `is already in class`.

In `@strict`, a field or method may start with `public`, `private`, or `protected`. The default is `public`. `@private` above the member is the same as the word `private`. `private` is only visible inside that class. `protected` is visible inside that class and its children. The compiler checks this. The JavaScript still stores a normal property, so a game and an engine can share the object.

```
@strict

class Vault
  private key = "moon"
  public fn read()
    return self.key
  end
end
```

`Vault().read()` is fine. `Vault().key` is the error `key is private on Vault`. A child may call a `protected` method. It may not read a `private` field. `public`, `private`, and `protected` outside `@strict` are the error `belongs in a @strict class`.

`Counter(2)` and `new Counter(2)` build one object. The call returns that object. Engine classes are JavaScript classes. Build those with `new`: `new Engine({ width: 480, height: 270 })`.

Construction does three things, in this order:

1. Field initializers run on the parent, then on the child. Each initializer can read `self` and can read fields that already ran. `class Child is Box` with `c = self.n + 1` sees `Box`'s field `n`.
2. The constructor runs. That is this class's `fn new`, or the nearest ancestor's `fn new` when this class has none.
3. The object is returned. A value returned from `fn new` is not the new object.

A class that defines `fn new` runs that constructor and stops. Parent fields have already run. The parent constructor runs when this constructor calls `super(...)`.

```
fn new(start)
  super(start)
end
```

```
class Box
  n = 1
  fn new(start)
    self.n = start
    self.made = "parent"
  end
end

class Loud is Box
  fn new(start)
    self.extra = start
  end
end

class Silent is Box
end

let loud = Loud(8)
let silent = Silent(8)
```

`Loud` defines `fn new` and does not call `super`. `loud.n` stays `1`, the field value. `loud.made` stays empty, because the parent constructor never stored it. `loud.extra` is `8`. `Silent` defines no `fn new`, so `Silent(8)` runs `Box`'s constructor. `silent.n` is `8` and `silent.made` is `"parent"`.

`self` is the object. It is available in methods, in field initializers, and in functions nested inside those. `self` outside a class is the error `self belongs inside a class`.

A field lives on the object. A method lives on the class, and every instance shares it. A child method with the same name is the method instances of the child call. `super.method(...)` calls the parent method on this same object. `super` in a class with no parent is the error `super needs a parent. Write class Child is Parent`.

```
fn label()
  return "C" .. super.label()
end
```

`super.label()` needs parentheses. `super(...)` with no method name runs the parent constructor.

`type(box)` is `"Counter"` for an instance of `Counter`. `type(Counter)` is `"fn"`. `len(Counter)` is `0`. Call the class to build an instance. `fn new` is not a method on the instance.

## Annotations

An annotation is `@` and a name. It may take arguments in parentheses. It sits above the next statement, or alone at the top of a file. Several may stack. They do not change how a line of Magic reads.

```
@strict
@note("entry")
fn start()
  print "go"
end
```

The name is matched without regard to case. `@Strict` is `@strict`. Arguments are ordinary values: `@note("hunt")`, `@tag(1, "x")`.

`@strict` and `@normal` are file-wide. They may sit on their own line at the top, or on the first statement. A later one wins. Unknown annotations, including `@note`, are kept and ignored.

`@public`, `@private`, and `@protected` on a class member mean the same as the words `public`, `private`, and `protected`.

## Strict mode

The default is normal. Normal Magic is the rest of this file. `@strict` asks the compiler for two extra checks, and nothing else: access on class members, and the types you wrote. It does not require types. It does not require `public`. A script with no `as` and no `private` compiles in strict mode the same way it does in normal mode, plus a few obvious traps such as `push(1, 2)`.

`compile(source, { strict: true })`, `magic run --strict`, and `msx --strict` turn strict on for a file that does not say `@normal`.

## Types

Types are optional. They use `as`, so `:` can still end a statement on the same line.

```
let hp as number = 3
fn greet(name as string) as string
  return "Hello, " .. name
end
```

A field takes the same mark: `n as number = 0`. A function value does too: `fn(x as number) as number`. The type is erased when the script becomes JavaScript.

These names are built in.

| Written | Meaning |
| --- | --- |
| `any` | No check. This is the default when `as` is missing. |
| `number` | A number. `int` is the same name. |
| `string` | Text |
| `bool` | `true` or `false`. `boolean` is the same name. |
| `fn` | A function |
| `list` | A list |
| `record` | A record, or a class instance |
| `nil` | Empty |
| a class name | That class, or a child of it |

Any other name is treated as a class type, including an imported `Engine`. The checker does not load other files to see their members.

In `@strict`, a written type is checked. Untyped names stay `any`. `nil` still fits any type. Extra arguments are still ignored. Missing arguments are still empty. The checker reports a mismatch it can see, and otherwise stays quiet.

```
@strict
let hp as number = 3
hp = "no"
```

That assignment is `cannot assign string to number`. `let hp = 3` then `hp = "no"` is fine, because `hp` was never typed.

`greet(1)` is an error when `greet` took `name as string`. `1()` is `cannot call a number` when that `1` is a number the checker already knows. `push(1, 2)` is `push expects a list`.

A class value fits a parent type: `let box as Box = Counter(2)` is fine when `Counter is Box`. The other way is an error.

## Built-in words

These names exist in every file. `print` is a statement. The rest are functions. A function may hide one of the functions with its own parameter or local. The statements below are the whole definition of each word. `error`, `sleep`, and `load` are part of this set.

### print

```
print
print value
print a, b, c
```

Writes one line to the console. With no values, the line is blank. With several values, each is passed through `str` and the pieces are joined by a tab. `print` is not a value.

### len(value)

`#value` is the same call.

| Value | Result |
| --- | --- |
| `nil`, missing | `0` |
| string | the number of Unicode code points |
| list | the number of items |
| record or other object | the number of its own keys |
| function | the number of parameters |
| class | `0` |
| number, bool | `0` |

```
print len("ab")
print #"🧙‍♀️"
print len([1, 2, 3])
```

Those three lines are `2`, `4`, and `3`.

### str(value)

Turns a value into text.

| Value | Text |
| --- | --- |
| `nil`, missing | `""` |
| string | that string |
| number | its spelling, including `NaN` and `Infinity` |
| bool | `true` or `false` |
| `fn name` | `name` |
| a function stored in a variable | the variable's name |
| a function value with no name | `fn` |
| list | the items joined by commas, so `[1, 2]` is `"1,2"` |
| record or class instance | `[object Object]` |

`..` and `&` use this conversion for both sides.

### num(value)

Reads a number, or `nil`.

| Value | Result |
| --- | --- |
| a finite number | that number |
| `NaN`, `Infinity` | `nil` |
| `true` | `1` |
| `false` | `0` |
| `nil`, missing, `""` | `nil` |
| other text | the number in that text, after trimming spaces |

Spaces that trim down to nothing are `0`, so `num("  ")` is `0`. `num("  3.5 ")` is `3.5`. `num("1e2")` is `100`. `num("3px")` is `nil`. Text that is not a number is `nil`.

Anything that is not already a number, a bool, or empty is read from the text JavaScript gives it. A one-item list `[1]` reads as `1`. A longer list reads as `nil`.

### int(value)

`num(value)` with the fraction dropped toward zero. `nil` stays `nil`.

| Call | Result |
| --- | --- |
| `int("3.9")` | `3` |
| `int("-3.9")` | `-3` |
| `int(-3.2)` | `-3` |
| `int(true)` | `1` |
| `int("nope")` | `nil` |
| `int("")` | `nil` |

`int(10 / 4)` is `2`.

### type(value)

Returns one of the texts in the values table: `nil`, `number`, `string`, `bool`, `fn`, `list`, `record`, or a constructor name. A Magic instance returns its class name. An engine object returns its JavaScript class name. A class, like a function, returns `fn`.

```
print type(nil)
print type(Counter(1))
print type(Counter)
```

Those lines are `nil`, `Counter`, and `fn`.

### keys(value)

The own keys of a record or object, as a new list, in insertion order. A list, a string, a number, a bool, a function, or `nil` gives `[]`.

```
let card = { name: "Ada", hp: 3 }
print keys(card)[0]
print keys(card)[1]
```

That is `name`, then `hp`.

### values(value)

A list of values.

| Value | Result |
| --- | --- |
| list | a new list with the same items |
| record or other object | a new list of its values, in key order |
| anything else | `[]` |

The copy is shallow. Replacing `values(bag)[0]` leaves `bag` as it was.

### push(list, item)

Appends `item` to `list` and returns `item`. `list` must be a list. Anything else throws `push expects a list` when the line runs.

```
let bag = ["witch"]
print push(bag, "wand")
print len(bag)
print bag[1]
```

That is `wand`, then `2`, then `wand`.

### pop(list)

Removes the last item and returns it. An empty list returns `nil`. `list` must be a list. Anything else throws `pop expects a list` when the line runs.

```
let bag = ["witch", "wand"]
print pop(bag)
print pop([])
```

That is `wand`, then a blank line.

### time()

The number of milliseconds since 1970-01-01 00:00 UTC. `type(time())` is `number`. The same clock as JavaScript's `Date.now()`.

### error(message)

Returns a JavaScript `Error` whose `message` is `str(message)`. It does not throw. `throw error("broke")` and `throw "broke"` are the same kind of error. `type(error("x"))` is `Error`.

### sleep(ms)

Returns a promise that becomes empty after `ms` milliseconds. `await sleep(16)` pauses an `async fn` for one frame-length tick. A missing or negative time waits 0 milliseconds.

### load(url, as)

Returns a promise for a file or a URL. `await load("map.json")` is the usual call.

| `url` | What it reads |
| --- | --- |
| `http:` or `https:` | `fetch` |
| a relative path, under `magic run` | a file next to the script, then a file from the current directory |
| a relative path, in a browser | `fetch` from the page |

The second argument chooses the shape. When it is omitted, a path that ends in `.json` is parsed as JSON. Anything else is text.

| `as` | Result |
| --- | --- |
| omitted, and the path looks like JSON | a record or a list |
| `"json"` | a record or a list |
| `"bytes"` | a list-like byte array |
| `"text"` or omitted | text |

A missing file or a failed fetch throws `cannot load` and the path. Catch it with `try`.

## Modules

Write an import at the top level of the file, outside `if` and loops. It can sit above or below functions. An import inside a function is the error `import belongs at the top of the script`. The names it binds are visible through the whole file.

```
import Engine, Terminal, Utilities from "2d"
import Engine as World from "3d"
import Application, Window, Button, Label from "ui"
import greet from "./words.magic"
import shout, add from "./helpers.js"
import default as twice from "./helpers.js"
import "./helpers.js" as helpers
import "2d" as sprites
import "./boot.magic"
```

There are three forms.

| Form | What you get |
| --- | --- |
| `import A, B as C from "where"` | the named exports, with `B` stored under the local name `C` |
| `import "where" as sprites` | the module under one name. A named export is `sprites.Engine` |
| `import "where"` | the module runs, and this file gains no names |

`from` is required on the named form. The module text is a string.

These specifiers name the engines. The short name and the package name are the same package.

| Specifier | Package | Browser global |
| --- | --- | --- |
| `2d`, `emoji-engine-2d` | emoji-engine-2d | `EmojiEngine` |
| `3d`, `emoji-engine-3d` | emoji-engine-3d | `EmojiEngine3D` |
| `ui`, `emoji-engine-ui` | emoji-engine-ui | `EmojiEngineUI` |

A path that ends in `.magic`, or a path that starts with `./` or `../` and does not end in `.js`, `.mjs`, `.cjs`, or `.json`, is another Magic file. `./witch` and `./witch.magic` are the file `witch.magic` next to the importer. `../lib/words` is `words.magic` in the folder above.

A path that ends in `.js`, `.mjs`, `.cjs`, or `.json` is a JavaScript module. `./helpers.js` is `helpers.js` next to the importer. Magic can call the functions that file exports. Any other specifier, such as a package name, stays a JavaScript import.

JavaScript files work in three shapes.

| The file | What you import |
| --- | --- |
| `export function shout` / `export const n` | those names: `import shout from "./helpers.js"` |
| `export default function twice` | `import default as twice from "./helpers.js"` |
| a classic `function triple()` with no `export` | that function: `import triple from "./plain.js"` |
| `module.exports = { add }` | the object on the default: `import "./cjs.js" as m` then `m.default.add` |
| a `.json` object | its keys: `import hp from "./stats.json"` |

`import default as name` is how a JavaScript default export becomes a Magic local. `default` cannot be a local name, so the `as` is required. `import "./helpers.js" as helpers` keeps the module under one name, and `helpers.shout("witch")` is an ordinary call.

`magic run` loads the JavaScript file from disk next to the script. `magic compile` keeps a real ESM import for `export` files, and copies classic scripts and JSON into the output. A classic page compiled with `compile(..., { target: 'script' })` still cannot import a JS file on its own. Use `magic run` or `magic compile -o`.

`magic run` and `magic compile` read the Magic files a script reaches. A file runs before the files that import it. Two files that import each other are the error `import cycle:` and the file names. A missing file is `cannot find`.

Every top-level `fn`, `class`, and `let` is a named export. There is no separate export mark, and there is no default export. `examples/words.magic` exports `greet` because `greet` is a top-level function.

```
fn greet(name)
  return "Hello, " .. name
end
```

Another file says `import greet from "./words.magic"` and calls `greet("witch")`.

A classic script compiled for a page can import `2d`, `3d`, and `ui`. It reads the browser globals in the table above. Bringing in another `.magic` file is the job of `magic run` and `magic compile`. That split is specified in [INTERFACES.md](INTERFACES.md).

## JavaScript, from Magic

A Magic list is a JavaScript array. A Magic record is a plain object. A Magic number is a JavaScript number. `nil` is `null`. A missing value is `undefined`. A function is a JavaScript function. A class is a JavaScript function that builds objects.

That is why a script and an engine can share lists, records, and functions. It is also why a condition follows JavaScript's truth, with one difference you can see: the empty values Magic talks about are `nil` and a hole, and both are false.

Names Magic does not know are properties of `globalThis`. These are ordinary Magic calls and assignments on values that come from there:

```
let engine = new Engine({ width: 480, height: 270 })
document.body.appendChild(engine.canvas)
requestAnimationFrame(frame)
let n = Math.floor(3.2)
```

`new` on a foreign class is a real JavaScript `new`. `new` needs parentheses: `new Engine({})`. The name after `new` may be a property: `new sprites.Engine({})`.

Member assignment and index assignment write JavaScript properties. `engine.x = 4` stores `x` on that object. A bare name on the left of `=` creates or updates a Magic local.

Errors thrown by an engine, by `push`, or by `pop`, are JavaScript errors. `try` / `catch` / `finally` catch them. `throw` raises one. `await fetch(url)` and `await load(url)` are ordinary Magic calls on values that come from JavaScript.

## Messages

The compiler reports `file:line:column message` and stops before the script runs. `push` and `pop` report when the bad call runs. These are the messages that state a language rule.

| Message | The rule |
| --- | --- |
| `use == to compare. = assigns a value` | A condition used `=` |
| `this value is unused. Call a function, or assign with =` | A statement was only a value |
| `this cannot be assigned to` | The left side was not a name, property, or index |
| `Name is already declared` | A second `let`, function, or class used `Name` in the same scope |
| `Name is already a parameter` | A parameter list repeated `Name` |
| `Name is a Magic word. Pick another name` | A binding or assignment used a keyword or a built-in |
| `Name is reserved. Pick another name` | The binding is a JavaScript reserved word |
| `names cannot start with __magic` | That prefix belongs to the compiler |
| `Name is imported. Pick another name` | An assignment targeted an import |
| `Name is a function` | An assignment targeted a function |
| `Name is a class` | An assignment targeted a class |
| `return belongs inside a fn` | `return` was outside a function |
| `break belongs inside a for, while, or repeat` | `break` was outside a loop, or inside a nested function |
| `continue belongs inside a for, while, or repeat` | `continue` was outside a loop, or inside a nested function |
| `self belongs inside a class` | `self` was outside a method or a field |
| `super needs a parent. Write class Child is Parent` | `super` was used in a class with no `is` |
| `class belongs at the top of the script` | A class was nested |
| `import belongs at the top of the script` | An import was nested |
| `write class Parent before class Child` | The parent class is lower in the same file |
| `new is the constructor. Write fn new()` | A field was named `new` |
| `Name is already in class Box` | A field or method was repeated |
| `a class holds fields and fn methods` | The class body held some other statement |
| `for i = start to stop, or for item in list` | A `for` matched neither form |
| `this function needs a name. Use fn name(), or fn() inside an expression` | `fn()` was used as a statement |
| `a named fn is a statement. Here, write fn(x)` | A function value was given a name |
| `a string has to end on the same line` | A quote ran past the line |
| `this string never ends` | The closing quote is missing |
| `unknown escape` | The backslash was not one of the escapes |
| `import cycle:` | Two Magic files import each other |
| `cannot find` | An import path has no file |
| `push expects a list` | `push` was called on a non-list |
| `pop expects a list` | `pop` was called on a non-list |
| `try needs catch or finally` | A `try` had no handler |
| `throw needs a value` | `throw` stood alone |
| `await belongs inside an async fn` | `await` sat in a plain `fn` |
| `fn new cannot be async` | The constructor was marked `async` |
| `cannot load` | `load` could not read the file or URL |
| `expected a name after @` | `@` was not followed by a name |
| `this annotation needs a statement` | An annotation sat before `end` with nothing to mark |
| `public belongs in a @strict class` | `public`, `private`, or `protected` was used without `@strict` |
| `Name is private on Box` | A private member was used outside that class |
| `Name is protected on Box` | A protected member was used outside that class and its children |
| `cannot assign string to number` | A written type did not match the value |
| `cannot call a number` | A value the checker knew was not a function was called |

## What a script cannot say

Magic has no `switch`. It has no default parameters, no rest parameters, and no destructuring. It has no string interpolation and no multiline string. It has no slice syntax. It has no static methods and no getters. Types, when you write them, are a short list of names: there are no unions, generics, or `?`. A class has one parent. A script cannot define a new operator. `fn new` cannot be `async`.

The words a script can define are `fn`, `class`, and the built-ins on this page. `examples/check.magic` exercises most of them in one file.
