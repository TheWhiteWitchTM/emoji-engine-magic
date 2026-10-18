import { ENGINES, engineKey, isJsSpecifier, isMagicSpecifier } from './engines.js';
import { MagicError } from './error.js';
import { Parser } from './parser.js';
import { BUILTIN_JS, BUILTIN_NAMES, PRELUDE_EXPORTS, preludeInlineSource } from './std.js';
/**
 * Compiles one Magic script to JavaScript.
 * Application code can call `compile`. A bundle calls `emitBody` once per file.
 */
export class Compiler {
    w = new Writer();
    filename = '';
    esm = false;
    bindings = [];
    scope = { kind: 'module', names: new Map(), parent: null };
    scopes = new WeakMap();
    root = builtinScope();
    selfExpr = null;
    superName = null;
    allowSuper = false;
    loop = 0;
    fnDepth = 0;
    canAwait = true;
    temps = 0;
    readyClasses = new Set();
    compile(source, options = {}) {
        const filename = options.filename ?? '';
        const program = new Parser(filename).parse(source);
        return this.compileProgram(program, options);
    }
    compileProgram(program, options = {}) {
        this.reset(program.filename || options.filename || '');
        const target = options.target ?? 'module';
        this.analyze(program);
        if (target === 'script')
            return this.compileScript(program);
        return this.compileModule(program, options);
    }
    /** True when the file awaits at the top level, so a script wrapper has to be async. */
    hasTopLevelAwait(program) {
        return this.hasTopAwait(program.body);
    }
    /** Statements for one file inside a bundle. The caller wraps them in a function. */
    emitBody(program, options) {
        this.reset(program.filename || options.filename || '');
        this.esm = false;
        this.bindings = options.bindings;
        this.analyze(program);
        this.checkBindings(program);
        this.emitMain(program);
        return { code: this.w.text(), exports: this.exportNames() };
    }
    compileModule(program, options) {
        this.esm = true;
        const resolve = options.resolve ?? defaultResolve;
        const prelude = options.prelude ?? './magic-std.js';
        this.header(program.filename);
        const imports = this.emitModuleImports(program, resolve, prelude);
        this.emitMain(program);
        return { code: this.w.text(), exports: this.exportNames(), imports };
    }
    compileScript(program) {
        this.esm = false;
        const imports = this.scriptBindings(program);
        this.header(program.filename);
        const asyncMain = this.hasTopAwait(program.body);
        this.w.line(`globalThis.__magic_module = (${asyncMain ? 'async ' : ''}() => {`);
        this.w.push();
        for (const line of preludeInlineSource().split('\n'))
            this.w.line(line);
        this.emitMain(program);
        this.w.pop();
        this.w.line('})();');
        return { code: this.w.text(), exports: this.exportNames(), imports };
    }
    header(filename) {
        const from = filename ? ` from ${filename}` : '';
        this.w.line(`// Compiled${from} by emoji-engine-magic.`);
    }
    emitModuleImports(program, resolve, prelude) {
        this.w.line(`import { ${PRELUDE_EXPORTS.join(', ')} } from ${JSON.stringify(prelude)};`);
        const compiled = [];
        for (const stmt of importsOf(program)) {
            const resolved = resolve(stmt.specifier);
            const engine = engineKey(stmt.specifier);
            const kind = engine ? 'engine' : isMagicSpecifier(stmt.specifier) ? 'magic' : 'js';
            compiled.push({
                specifier: stmt.specifier,
                resolved,
                kind,
                engine,
                form: stmt.form,
                alias: stmt.alias,
                names: stmt.names,
            });
            const from = JSON.stringify(resolved);
            if (stmt.form === 'side') {
                this.w.line(`import ${from};`);
            }
            else if (stmt.form === 'namespace' && stmt.alias) {
                this.w.line(`import * as ${stmt.alias} from ${from};`);
            }
            else {
                const names = stmt.names
                    .map((name) => (name.imported === name.local ? name.imported : `${name.imported} as ${name.local}`))
                    .join(', ');
                this.w.line(`import { ${names} } from ${from};`);
            }
        }
        return compiled;
    }
    scriptBindings(program) {
        const compiled = [];
        for (const stmt of importsOf(program)) {
            if (isMagicSpecifier(stmt.specifier)) {
                this.oops(stmt, 'this script imports another Magic file. Use magic run, or magic compile -o');
            }
            if (isJsSpecifier(stmt.specifier)) {
                this.oops(stmt, 'this script imports a JavaScript file. Use magic run, or magic compile -o');
            }
            const engine = engineKey(stmt.specifier);
            if (!engine)
                this.oops(stmt, `${stmt.specifier} is not 2d, 3d, or ui`);
            const info = ENGINES[engine];
            const ns = `globalThis.${info.global}`;
            compiled.push({
                specifier: stmt.specifier,
                resolved: ns,
                kind: 'engine',
                engine,
                form: stmt.form,
                alias: stmt.alias,
                names: stmt.names,
            });
            if (stmt.form === 'namespace' && stmt.alias)
                this.bindings.push({ local: stmt.alias, expr: ns });
            if (stmt.form === 'named') {
                for (const name of stmt.names)
                    this.bindings.push({ local: name.local, expr: `${ns}.${name.imported}` });
            }
        }
        return compiled;
    }
    checkBindings(program) {
        const have = new Set(this.bindings.map((binding) => binding.local));
        for (const stmt of importsOf(program)) {
            const locals = stmt.form === 'namespace' && stmt.alias ? [stmt.alias] : stmt.names.map((name) => name.local);
            for (const local of locals) {
                if (!have.has(local))
                    this.oops(stmt, `missing a binding for ${local}`);
            }
        }
    }
    emitMain(program) {
        this.scope = this.scopes.get(program) ?? this.scope;
        for (const binding of this.bindings)
            this.w.line(`const ${binding.local} = ${binding.expr};`);
        this.emitHoist(this.scope);
        for (const stmt of program.body) {
            if (stmt.kind === 'import')
                continue;
            this.emitStmt(stmt);
        }
        if (!this.esm)
            this.w.line(`return { ${this.exportNames().join(', ')} };`);
    }
    emitHoist(scope) {
        for (const [name, kind] of scope.names) {
            if (kind !== 'let')
                continue;
            if (this.esm && scope.kind === 'module')
                this.w.line(`export let ${name};`);
            else
                this.w.line(`let ${name};`);
        }
    }
    exportNames() {
        const scope = this.scopes.get(this.programKey) ?? this.scope;
        const names = [];
        for (const [name, kind] of scope.names) {
            if (kind === 'let' || kind === 'fn' || kind === 'class')
                names.push(name);
        }
        return names;
    }
    programKey = {};
    emitStmt(stmt) {
        switch (stmt.kind) {
            case 'import':
                return;
            case 'fn':
                this.emitFn(stmt);
                return;
            case 'class':
                this.emitClass(stmt);
                return;
            case 'let':
                if (stmt.init)
                    this.w.line(`${stmt.name} = ${this.expr(stmt.init)};`);
                return;
            case 'assign':
                this.emitAssign(stmt);
                return;
            case 'print':
                this.w.line(`__magic_print(${stmt.args.map((arg) => this.expr(arg)).join(', ')});`);
                return;
            case 'expr':
                this.w.line(`${this.expr(stmt.expr)};`);
                return;
            case 'throw':
                this.w.line(`throw __magic_raise(${this.expr(stmt.value)});`);
                return;
            case 'try':
                this.emitTry(stmt);
                return;
            case 'return':
                if (this.fnDepth <= 0)
                    this.oops(stmt, 'return belongs inside a fn');
                this.w.line(stmt.value ? `return ${this.expr(stmt.value)};` : 'return;');
                return;
            case 'break':
                if (this.loop <= 0)
                    this.oops(stmt, 'break belongs inside a for, while, or repeat');
                this.w.line('break;');
                return;
            case 'continue':
                if (this.loop <= 0)
                    this.oops(stmt, 'continue belongs inside a for, while, or repeat');
                this.w.line('continue;');
                return;
            case 'if':
                this.emitIf(stmt);
                return;
            case 'while':
                this.w.line(`while (${this.expr(stmt.test)}) {`);
                this.w.push();
                this.emitLoop(stmt.body);
                this.w.pop();
                this.w.line('}');
                return;
            case 'repeat':
                this.w.line('do {');
                this.w.push();
                this.emitLoop(stmt.body);
                this.w.pop();
                this.w.line(`} while (!(${this.expr(stmt.test)}));`);
                return;
            case 'for':
                this.emitFor(stmt);
                return;
            default:
                return;
        }
    }
    emitTry(stmt) {
        this.w.line('try {');
        this.w.push();
        for (const inner of stmt.body)
            this.emitStmt(inner);
        this.w.pop();
        if (stmt.catchBody) {
            if (stmt.catchName) {
                this.w.line('} catch (__magic_e) {');
                this.w.push();
                this.w.line(`${stmt.catchName} = __magic_e;`);
                for (const inner of stmt.catchBody)
                    this.emitStmt(inner);
                this.w.pop();
            }
            else {
                this.w.line('} catch {');
                this.w.push();
                for (const inner of stmt.catchBody)
                    this.emitStmt(inner);
                this.w.pop();
            }
        }
        if (stmt.finallyBody) {
            this.w.line('} finally {');
            this.w.push();
            for (const inner of stmt.finallyBody)
                this.emitStmt(inner);
            this.w.pop();
        }
        this.w.line('}');
    }
    emitIf(stmt) {
        stmt.arms.forEach((arm, index) => {
            this.w.line(`${index === 0 ? 'if' : '} else if'} (${this.expr(arm.test)}) {`);
            this.w.push();
            for (const inner of arm.body)
                this.emitStmt(inner);
            this.w.pop();
        });
        if (stmt.elseBody) {
            this.w.line('} else {');
            this.w.push();
            for (const inner of stmt.elseBody)
                this.emitStmt(inner);
            this.w.pop();
        }
        this.w.line('}');
    }
    emitFor(stmt) {
        if (stmt.iter) {
            const item = this.temp();
            this.w.line(`for (const ${item} of __magic_iter(${this.expr(stmt.iter)})) {`);
            this.w.push();
            this.w.line(`${stmt.name} = ${item};`);
            this.emitLoop(stmt.body);
            this.w.pop();
            this.w.line('}');
            return;
        }
        const to = this.temp();
        const step = this.temp();
        this.w.line('{');
        this.w.push();
        this.w.line(`const ${to} = ${this.expr(stmt.to)};`);
        this.w.line(`const ${step} = ${stmt.step ? this.expr(stmt.step) : '1'};`);
        this.w.line(`for (${stmt.name} = ${this.expr(stmt.from)}; ${step} >= 0 ? ${stmt.name} <= ${to} : ${stmt.name} >= ${to}; ${stmt.name} = ${stmt.name} + ${step}) {`);
        this.w.push();
        this.emitLoop(stmt.body);
        this.w.pop();
        this.w.line('}');
        this.w.pop();
        this.w.line('}');
    }
    emitLoop(body) {
        this.loop += 1;
        for (const stmt of body)
            this.emitStmt(stmt);
        this.loop -= 1;
    }
    emitAssign(stmt) {
        const math = stmt.op === '=' ? null : stmt.op[0];
        if (stmt.target.kind === 'name') {
            const left = this.assignable(stmt.target.name, stmt);
            const right = this.expr(stmt.value);
            this.w.line(math ? `${left} = ${left} ${math} (${right});` : `${left} = ${right};`);
            return;
        }
        const object = this.temp();
        this.w.line('{');
        this.w.push();
        if (stmt.target.kind === 'member') {
            this.w.line(`const ${object} = ${this.expr(stmt.target.object)};`);
            const slot = `${object}.${stmt.target.name}`;
            const right = this.expr(stmt.value);
            this.w.line(math ? `${slot} = ${slot} ${math} (${right});` : `${slot} = ${right};`);
        }
        else if (stmt.target.kind === 'index') {
            const index = this.temp();
            this.w.line(`const ${object} = ${this.expr(stmt.target.object)};`);
            this.w.line(`const ${index} = ${this.expr(stmt.target.index)};`);
            const slot = `${object}[${index}]`;
            const right = this.expr(stmt.value);
            this.w.line(math ? `${slot} = ${slot} ${math} (${right});` : `${slot} = ${right};`);
        }
        else {
            this.oops(stmt, 'this cannot be assigned to');
        }
        this.w.pop();
        this.w.line('}');
    }
    emitFn(stmt) {
        const scope = this.needScope(stmt, stmt.name);
        const exporting = this.esm && this.scope.kind === 'module';
        const header = `${exporting ? 'export ' : ''}${stmt.async ? 'async ' : ''}function ${stmt.name}(${stmt.params.join(', ')}) {`;
        this.emitFnBody(header, stmt.body, scope, {
            bindSelf: false,
            inheritSelf: true,
            allowSuper: this.allowSuper,
            superName: this.superName,
            selfExpr: this.selfExpr,
            canAwait: stmt.async,
        });
    }
    emitClass(stmt) {
        if (stmt.parent) {
            const found = this.scope.names.get(stmt.parent);
            if (found === 'class' && !this.readyClasses.has(stmt.parent)) {
                this.oops(stmt, `write class ${stmt.parent} before class ${stmt.name}`);
            }
        }
        const parentJs = stmt.parent ? this.ref(stmt.parent) : null;
        const exporting = this.esm && this.scope.kind === 'module';
        this.w.line(`${exporting ? 'export ' : ''}function ${stmt.name}(...__magic_args) {`);
        this.w.push();
        this.w.line(`if (!new.target) return Reflect.construct(${stmt.name}, __magic_args);`);
        this.w.line('__magic_inits(new.target, this);');
        this.w.line('const __magic_ctor = new.target.prototype.__magicNew;');
        this.w.line('if (typeof __magic_ctor === "function") __magic_ctor.apply(this, __magic_args);');
        this.w.line('return this;');
        this.w.pop();
        this.w.line('}');
        this.w.line(`${stmt.name}.__magicParent = ${parentJs ?? 'null'};`);
        this.emitInit(stmt);
        if (parentJs) {
            this.w.line(`${stmt.name}.prototype = Object.create(${parentJs}.prototype);`);
            this.w.line(`${stmt.name}.prototype.constructor = ${stmt.name};`);
        }
        for (const method of stmt.methods)
            this.emitMethod(stmt.name, method, parentJs);
        this.readyClasses.add(stmt.name);
    }
    emitInit(stmt) {
        this.w.line(`${stmt.name}.__magicInit = function () {`);
        this.w.push();
        const saved = this.saveFlags();
        this.selfExpr = '__magic_self';
        this.allowSuper = false;
        this.superName = null;
        this.canAwait = false;
        this.w.line('const __magic_self = this;');
        for (const field of stmt.fields) {
            this.w.line(`__magic_self.${field.name} = ${this.expr(field.init)};`);
        }
        this.restoreFlags(saved);
        this.w.pop();
        this.w.line('};');
    }
    emitMethod(className, method, parentJs) {
        const scope = this.needScope(method, method.name);
        const jsName = method.name === 'new' ? '__magicNew' : method.name;
        const header = `${className}.prototype.${jsName} = ${method.async ? 'async ' : ''}function (${method.params.join(', ')}) {`;
        this.emitFnBody(header, method.body, scope, {
            bindSelf: true,
            inheritSelf: false,
            allowSuper: parentJs !== null,
            superName: parentJs,
            selfExpr: null,
            canAwait: method.async,
        });
    }
    emitFnBody(header, body, scope, flags) {
        const saved = this.saveFlags();
        const savedScope = this.scope;
        const savedLoop = this.loop;
        const savedDepth = this.fnDepth;
        this.scope = scope;
        this.loop = 0;
        this.fnDepth = savedDepth + 1;
        if (!flags.inheritSelf) {
            this.selfExpr = null;
            this.superName = null;
            this.allowSuper = false;
        }
        if (flags.bindSelf) {
            this.selfExpr = '__magic_self';
            this.allowSuper = flags.allowSuper;
            this.superName = flags.superName;
        }
        this.canAwait = flags.canAwait;
        this.w.line(header);
        this.w.push();
        if (flags.bindSelf)
            this.w.line('const __magic_self = this;');
        this.emitHoist(scope);
        for (const stmt of body)
            this.emitStmt(stmt);
        this.w.pop();
        this.w.line('}');
        this.scope = savedScope;
        this.loop = savedLoop;
        this.fnDepth = savedDepth;
        this.restoreFlags(saved);
    }
    emitAnon(expr) {
        const scope = this.needScope(expr, 'fn');
        const sub = new Writer(this.w.indent);
        const savedWriter = this.w;
        this.w = sub;
        this.emitFnBody(`${expr.async ? 'async ' : ''}function (${expr.params.join(', ')}) {`, expr.body, scope, {
            bindSelf: false,
            inheritSelf: true,
            allowSuper: this.allowSuper,
            superName: this.superName,
            selfExpr: this.selfExpr,
            canAwait: expr.async,
        });
        this.w = savedWriter;
        return `(${sub.text().trim()})`;
    }
    expr(expr) {
        switch (expr.kind) {
            case 'number':
                return expr.raw;
            case 'string':
                return JSON.stringify(expr.value);
            case 'bool':
                return expr.value ? 'true' : 'false';
            case 'nil':
                return 'null';
            case 'name':
                return this.ref(expr.name);
            case 'self':
                return this.selfRef(expr);
            case 'list':
                return `[${expr.items.map((item) => this.expr(item)).join(', ')}]`;
            case 'record':
                return `({ ${expr.fields.map((field) => `${this.prop(field.name)}: ${this.expr(field.value)}`).join(', ')} })`;
            case 'unary':
                if (expr.op === 'not')
                    return `!(${this.expr(expr.expr)})`;
                if (expr.op === '#')
                    return `__magic_len(${this.expr(expr.expr)})`;
                return `-(${this.expr(expr.expr)})`;
            case 'binary':
                return this.binary(expr);
            case 'call':
                return `${this.callee(expr.callee)}(${expr.args.map((arg) => this.expr(arg)).join(', ')})`;
            case 'member':
                return `${this.expr(expr.object)}.${expr.name}`;
            case 'index':
                return `${this.expr(expr.object)}[${this.expr(expr.index)}]`;
            case 'new':
                return `new ${this.callee(expr.callee)}(${expr.args.map((arg) => this.expr(arg)).join(', ')})`;
            case 'fn':
                return this.emitAnon(expr);
            case 'super':
                return this.superCall(expr);
            case 'await':
                if (!this.canAwait)
                    this.oops(expr, 'await belongs inside an async fn');
                return `await (${this.expr(expr.expr)})`;
            default:
                return 'null';
        }
    }
    binary(expr) {
        const left = this.expr(expr.left);
        const right = this.expr(expr.right);
        if (expr.op === '&')
            return `__magic_cat(${left}, ${right})`;
        if (expr.op === '^')
            return `Math.pow(${left}, ${right})`;
        const op = expr.op === 'and' ? '&&' : expr.op === 'or' ? '||' : expr.op === '==' ? '===' : expr.op === '!=' || expr.op === '<>' ? '!==' : expr.op;
        return `(${left} ${op} ${right})`;
    }
    superCall(expr) {
        if (!this.allowSuper || !this.superName) {
            this.oops(expr, 'super needs a parent. Write class Child is Parent');
        }
        if (expr.method === null) {
            const args = expr.args.map((arg) => this.expr(arg)).join(', ');
            return `__magic_super(${this.superName}, __magic_self, [${args}])`;
        }
        const args = ['__magic_self', ...expr.args.map((arg) => this.expr(arg))].join(', ');
        return `${this.superName}.prototype.${expr.method}.call(${args})`;
    }
    prop(name) {
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
    }
    callee(expr) {
        if (expr.kind === 'name')
            return this.ref(expr.name);
        if (expr.kind === 'member')
            return `${this.expr(expr.object)}.${expr.name}`;
        if (expr.kind === 'index')
            return this.expr(expr);
        return `(${this.expr(expr)})`;
    }
    ref(name) {
        const found = this.lookup(name);
        if (!found)
            return name === 'globalThis' ? 'globalThis' : `globalThis.${name}`;
        if (found.kind === 'builtin')
            return BUILTIN_JS[name] ?? name;
        return name;
    }
    assignable(name, node) {
        const found = this.lookup(name);
        if (!found)
            this.oops(node, `${name} is not declared`);
        if (found.kind === 'builtin')
            this.oops(node, `${name} is a Magic word. Pick another name`);
        if (found.kind === 'import')
            this.oops(node, `${name} is imported. Pick another name`);
        if (found.kind === 'fn')
            this.oops(node, `${name} is a function`);
        if (found.kind === 'class')
            this.oops(node, `${name} is a class`);
        return name;
    }
    selfRef(node) {
        if (!this.selfExpr)
            this.oops(node, 'self belongs inside a class');
        return this.selfExpr;
    }
    analyze(program) {
        const moduleScope = { kind: 'module', names: new Map(), parent: this.root };
        this.programKey = program;
        this.analyzeBody(program.body, moduleScope, program);
    }
    analyzeBody(body, scope, key) {
        this.scopes.set(key, scope);
        this.scanSurface(body, scope);
        this.scanNested(body, scope);
    }
    scanSurface(body, scope) {
        for (const stmt of body)
            this.scanStmt(stmt, scope);
    }
    scanStmt(stmt, scope) {
        switch (stmt.kind) {
            case 'import':
                if (scope.kind !== 'module')
                    this.oops(stmt, 'import belongs at the top of the script');
                if (stmt.form === 'namespace' && stmt.alias)
                    this.declare(scope, stmt.alias, 'import', stmt);
                for (const name of stmt.names)
                    this.declare(scope, name.local, 'import', stmt);
                return;
            case 'fn':
                this.declare(scope, stmt.name, 'fn', stmt);
                return;
            case 'class':
                if (scope.kind !== 'module')
                    this.oops(stmt, 'class belongs at the top of the script');
                this.declare(scope, stmt.name, 'class', stmt);
                return;
            case 'let':
                this.declare(scope, stmt.name, 'let', stmt);
                return;
            case 'for':
                this.declare(scope, stmt.name, 'let', stmt, true);
                this.scanSurface(stmt.body, scope);
                return;
            case 'if':
                for (const arm of stmt.arms)
                    this.scanSurface(arm.body, scope);
                if (stmt.elseBody)
                    this.scanSurface(stmt.elseBody, scope);
                return;
            case 'while':
            case 'repeat':
                this.scanSurface(stmt.body, scope);
                return;
            case 'try':
                this.scanSurface(stmt.body, scope);
                if (stmt.catchName)
                    this.declare(scope, stmt.catchName, 'let', stmt, true);
                if (stmt.catchBody)
                    this.scanSurface(stmt.catchBody, scope);
                if (stmt.finallyBody)
                    this.scanSurface(stmt.finallyBody, scope);
                return;
            case 'assign':
                this.scanAssign(stmt, scope);
                return;
            default:
                return;
        }
    }
    scanAssign(stmt, scope) {
        if (stmt.target.kind !== 'name')
            return;
        const found = this.lookupFrom(scope, stmt.target.name);
        if (!found) {
            scope.names.set(stmt.target.name, 'let');
            return;
        }
        if (found.kind === 'builtin')
            this.oops(stmt, `${stmt.target.name} is a Magic word. Pick another name`);
        if (found.kind === 'import')
            this.oops(stmt, `${stmt.target.name} is imported. Pick another name`);
        if (found.kind === 'fn')
            this.oops(stmt, `${stmt.target.name} is a function`);
        if (found.kind === 'class')
            this.oops(stmt, `${stmt.target.name} is a class`);
    }
    scanNested(body, scope) {
        for (const stmt of body)
            this.nestStmt(stmt, scope);
    }
    nestStmt(stmt, scope) {
        switch (stmt.kind) {
            case 'fn':
                this.analyzeFunction(stmt.body, stmt.params, scope, stmt);
                return;
            case 'class':
                for (const method of stmt.methods)
                    this.analyzeFunction(method.body, method.params, scope, method);
                for (const field of stmt.fields)
                    this.nestExpr(field.init, scope);
                return;
            case 'if':
                for (const arm of stmt.arms) {
                    this.nestExpr(arm.test, scope);
                    this.scanNested(arm.body, scope);
                }
                if (stmt.elseBody)
                    this.scanNested(stmt.elseBody, scope);
                return;
            case 'while':
                this.nestExpr(stmt.test, scope);
                this.scanNested(stmt.body, scope);
                return;
            case 'repeat':
                this.scanNested(stmt.body, scope);
                this.nestExpr(stmt.test, scope);
                return;
            case 'for':
                this.nestExpr(stmt.from, scope);
                this.nestExpr(stmt.to, scope);
                this.nestExpr(stmt.step, scope);
                this.nestExpr(stmt.iter, scope);
                this.scanNested(stmt.body, scope);
                return;
            case 'let':
                this.nestExpr(stmt.init, scope);
                return;
            case 'assign':
                this.nestExpr(stmt.target, scope);
                this.nestExpr(stmt.value, scope);
                return;
            case 'print':
                for (const arg of stmt.args)
                    this.nestExpr(arg, scope);
                return;
            case 'expr':
                this.nestExpr(stmt.expr, scope);
                return;
            case 'return':
                this.nestExpr(stmt.value, scope);
                return;
            case 'throw':
                this.nestExpr(stmt.value, scope);
                return;
            case 'try':
                this.scanNested(stmt.body, scope);
                if (stmt.catchBody)
                    this.scanNested(stmt.catchBody, scope);
                if (stmt.finallyBody)
                    this.scanNested(stmt.finallyBody, scope);
                return;
            default:
                return;
        }
    }
    analyzeFunction(body, params, parent, key) {
        const inner = this.child(parent, 'function');
        for (const param of params)
            this.declare(inner, param, 'param', key);
        this.analyzeBody(body, inner, key);
    }
    nestExpr(expr, scope) {
        if (!expr)
            return;
        switch (expr.kind) {
            case 'fn':
                this.analyzeFunction(expr.body, expr.params, scope, expr);
                return;
            case 'unary':
                this.nestExpr(expr.expr, scope);
                return;
            case 'binary':
                this.nestExpr(expr.left, scope);
                this.nestExpr(expr.right, scope);
                return;
            case 'call':
            case 'new':
                this.nestExpr(expr.callee, scope);
                for (const arg of expr.args)
                    this.nestExpr(arg, scope);
                return;
            case 'member':
                this.nestExpr(expr.object, scope);
                return;
            case 'index':
                this.nestExpr(expr.object, scope);
                this.nestExpr(expr.index, scope);
                return;
            case 'list':
                for (const item of expr.items)
                    this.nestExpr(item, scope);
                return;
            case 'record':
                for (const field of expr.fields)
                    this.nestExpr(field.value, scope);
                return;
            case 'super':
                for (const arg of expr.args)
                    this.nestExpr(arg, scope);
                return;
            case 'await':
                this.nestExpr(expr.expr, scope);
                return;
            default:
                return;
        }
    }
    declare(scope, name, kind, node, reuse = false) {
        const existing = scope.names.get(name);
        if (existing) {
            if (reuse && (existing === 'let' || existing === 'param'))
                return;
            this.oops(node, `${name} is already declared`);
        }
        scope.names.set(name, kind);
    }
    lookup(name) {
        return this.lookupFrom(this.scope, name);
    }
    lookupFrom(scope, name) {
        let current = scope;
        while (current) {
            const kind = current.names.get(name);
            if (kind)
                return { kind };
            current = current.parent;
        }
        return null;
    }
    child(parent, kind) {
        return { kind, names: new Map(), parent };
    }
    needScope(key, label) {
        const scope = this.scopes.get(key);
        if (!scope)
            throw new MagicError(`missing scope for ${label}`, 1, 1, this.filename);
        return scope;
    }
    saveFlags() {
        return {
            bindSelf: false,
            inheritSelf: true,
            allowSuper: this.allowSuper,
            superName: this.superName,
            selfExpr: this.selfExpr,
            canAwait: this.canAwait,
        };
    }
    restoreFlags(flags) {
        this.allowSuper = flags.allowSuper;
        this.superName = flags.superName;
        this.selfExpr = flags.selfExpr;
        this.canAwait = flags.canAwait;
    }
    hasTopAwait(body) {
        return body.some((stmt) => this.stmtHasTopAwait(stmt));
    }
    stmtHasTopAwait(stmt) {
        switch (stmt.kind) {
            case 'fn':
            case 'class':
            case 'import':
            case 'break':
            case 'continue':
                return false;
            case 'let':
                return this.exprHasTopAwait(stmt.init);
            case 'assign':
                return this.exprHasTopAwait(stmt.target) || this.exprHasTopAwait(stmt.value);
            case 'print':
                return stmt.args.some((arg) => this.exprHasTopAwait(arg));
            case 'expr':
                return this.exprHasTopAwait(stmt.expr);
            case 'return':
                return this.exprHasTopAwait(stmt.value);
            case 'throw':
                return this.exprHasTopAwait(stmt.value);
            case 'if':
                if (stmt.arms.some((arm) => this.exprHasTopAwait(arm.test) || this.hasTopAwait(arm.body)))
                    return true;
                return stmt.elseBody ? this.hasTopAwait(stmt.elseBody) : false;
            case 'while':
                return this.exprHasTopAwait(stmt.test) || this.hasTopAwait(stmt.body);
            case 'repeat':
                return this.hasTopAwait(stmt.body) || this.exprHasTopAwait(stmt.test);
            case 'for':
                return (this.exprHasTopAwait(stmt.from) ||
                    this.exprHasTopAwait(stmt.to) ||
                    this.exprHasTopAwait(stmt.step) ||
                    this.exprHasTopAwait(stmt.iter) ||
                    this.hasTopAwait(stmt.body));
            case 'try':
                if (this.hasTopAwait(stmt.body))
                    return true;
                if (stmt.catchBody && this.hasTopAwait(stmt.catchBody))
                    return true;
                return stmt.finallyBody ? this.hasTopAwait(stmt.finallyBody) : false;
            default:
                return false;
        }
    }
    exprHasTopAwait(expr) {
        if (!expr)
            return false;
        switch (expr.kind) {
            case 'await':
                return true;
            case 'fn':
                return false;
            case 'unary':
                return this.exprHasTopAwait(expr.expr);
            case 'binary':
                return this.exprHasTopAwait(expr.left) || this.exprHasTopAwait(expr.right);
            case 'call':
            case 'new':
                return this.exprHasTopAwait(expr.callee) || expr.args.some((arg) => this.exprHasTopAwait(arg));
            case 'member':
                return this.exprHasTopAwait(expr.object);
            case 'index':
                return this.exprHasTopAwait(expr.object) || this.exprHasTopAwait(expr.index);
            case 'list':
                return expr.items.some((item) => this.exprHasTopAwait(item));
            case 'record':
                return expr.fields.some((field) => this.exprHasTopAwait(field.value));
            case 'super':
                return expr.args.some((arg) => this.exprHasTopAwait(arg));
            default:
                return false;
        }
    }
    temp() {
        this.temps += 1;
        return `__magic_t${this.temps}`;
    }
    reset(filename) {
        this.w = new Writer();
        this.filename = filename;
        this.esm = false;
        this.bindings = [];
        this.scope = { kind: 'module', names: new Map(), parent: this.root };
        this.selfExpr = null;
        this.superName = null;
        this.allowSuper = false;
        this.loop = 0;
        this.fnDepth = 0;
        this.canAwait = true;
        this.temps = 0;
        this.readyClasses.clear();
        this.programKey = {};
    }
    oops(node, message) {
        throw new MagicError(message, node.line, node.column, this.filename);
    }
}
/** Compile one Magic script. */
export function compile(source, options) {
    return new Compiler().compile(source, options);
}
export function defaultResolve(specifier) {
    const engine = engineKey(specifier);
    if (engine)
        return ENGINES[engine].package;
    if (isMagicSpecifier(specifier)) {
        const withExt = specifier.endsWith('.magic') ? specifier : `${specifier}.magic`;
        return withExt.replace(/\.magic$/, '.js');
    }
    return specifier;
}
function importsOf(program) {
    return program.body.filter((stmt) => stmt.kind === 'import');
}
function builtinScope() {
    const names = new Map();
    for (const name of BUILTIN_NAMES)
        names.set(name, 'builtin');
    return { kind: 'function', names, parent: null };
}
class Writer {
    lines = [];
    indent;
    constructor(indent = 0) {
        this.indent = indent;
    }
    line(text = '') {
        if (!text)
            this.lines.push('');
        else
            this.lines.push(`${'  '.repeat(this.indent)}${text}`);
    }
    push() {
        this.indent += 1;
    }
    pop() {
        this.indent = Math.max(0, this.indent - 1);
    }
    text() {
        return `${this.lines.join('\n')}\n`;
    }
}
//# sourceMappingURL=compiler.js.map