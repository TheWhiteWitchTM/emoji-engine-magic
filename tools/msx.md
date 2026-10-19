# msx

`msx` runs Magic without a compile step you have to look at. It is the same idea as `tsx`: you point it at a file, and the file runs.

```bash
msx game.magic
msx --strict game.magic
msx --watch game.magic
msx -e 'print 1 + 2'
msx
```

`magic run game.magic` does the same job as `msx game.magic`. `msx` is the short form, with watch, eval, a REPL, and script arguments.

## File

```bash
msx examples/hunt.magic
msx examples/hunt.magic -- --seed 3
```

The script path becomes `process.argv[1]`. Extra words after the file, or after `--`, are `process.argv[2]` onward. Magic already reads unknown names from `globalThis`, so `process.argv` is there.

`--strict` checks the file the way `@strict` does. A file that writes `@strict` is already strict.

`--watch` runs the file, then runs it again when that file changes.

## Eval

```bash
msx -e 'print "hello"'
msx --eval 'print 10 mod 3'
```

The snippet is a complete Magic program. Use `fn` / `end` when you need more than one line, or open the REPL.

## REPL

`msx` with no file opens a prompt.

```
magic> print 1 + 2
3
magic> fn greet(name)
...     return "Hello, " .. name
...   end
magic> print greet("Ada")
Hello, Ada
```

A `fn`, `class`, `let`, `import`, or assignment stays for the next line. `print` and other work do not. `.clear` drops stored lines. `.exit` leaves.

The prompt is `magic>`. A block that still needs `end` uses `...`.

## Errors

A Magic mistake prints `file:line:column message` and exits 1, the same as `magic`.
