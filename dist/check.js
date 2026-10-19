import { MagicError } from './error.js';
/**
 * True when this file opted into strict mode.
 * `@strict` turns it on. `@normal` turns it off. A later one wins.
 * `fallback` is the compiler option when the file says nothing.
 */
export function fileIsStrict(program, fallback = false) {
    let strict = fallback;
    for (const ann of fileAnnotations(program)) {
        if (ann.name === 'strict')
            strict = true;
        if (ann.name === 'normal')
            strict = false;
    }
    return strict;
}
/** Walk a parsed program and report the traps strict mode is here to catch. */
export function checkProgram(program, filename, strict) {
    new Checker(filename, strict).check(program);
}
const ANY = { tag: 'any' };
const NIL = { tag: 'nil' };
const NUMBER = { tag: 'number' };
const STRING = { tag: 'string' };
const BOOL = { tag: 'bool' };
const FN = { tag: 'fn' };
const LIST = { tag: 'list' };
const RECORD = { tag: 'record' };
const PRIMITIVE = {
    any: ANY,
    number: NUMBER,
    int: NUMBER,
    string: STRING,
    bool: BOOL,
    boolean: BOOL,
    fn: FN,
    list: LIST,
    record: RECORD,
    nil: NIL,
};
class Checker {
    filename;
    strict;
    classes = new Map();
    stack = [];
    builtins = new Map();
    className = null;
    returnType = null;
    constructor(filename, strict) {
        this.filename = filename;
        this.strict = strict;
    }
    check(program) {
        const top = new Map();
        this.seedBuiltins(top);
        this.stack.push(top);
        this.collectClasses(program.body);
        this.declareSurface(program.body, top);
        if (!this.strict) {
            this.rejectAccess(program.body);
            return;
        }
        this.walkBody(program.body);
    }
    collectClasses(body) {
        for (const stmt of body) {
            if (stmt.kind !== 'class')
                continue;
            const members = new Map();
            let ctor = { tag: 'fn', params: [], returns: { tag: 'class', className: stmt.name } };
            for (const field of stmt.fields) {
                members.set(field.name, {
                    access: field.access ?? 'public',
                    type: this.fromRef(field.type),
                    kind: 'field',
                });
            }
            for (const method of stmt.methods) {
                const type = this.fnType(method.params, method.type);
                if (method.name === 'new') {
                    ctor = { tag: 'fn', params: method.params.map((param) => this.fromRef(param.type)), returns: { tag: 'class', className: stmt.name } };
                    members.set('new', { access: method.access ?? 'public', type, kind: 'ctor' });
                }
                else {
                    members.set(method.name, { access: method.access ?? 'public', type, kind: 'method' });
                }
            }
            this.classes.set(stmt.name, { name: stmt.name, parent: stmt.parent, members, ctor, node: stmt });
        }
    }
    declareSurface(body, scope) {
        for (const stmt of body) {
            switch (stmt.kind) {
                case 'import':
                    if (stmt.form === 'namespace' && stmt.alias)
                        this.bind(scope, stmt.alias, ANY);
                    for (const name of stmt.names)
                        this.bind(scope, name.local, ANY);
                    break;
                case 'fn':
                    this.bind(scope, stmt.name, this.fnType(stmt.params, stmt.type));
                    break;
                case 'class':
                    this.bind(scope, stmt.name, this.classes.get(stmt.name)?.ctor ?? FN);
                    break;
                case 'let':
                    this.bind(scope, stmt.name, stmt.type ? this.fromRef(stmt.type) : ANY);
                    break;
                case 'for':
                    if (!scope.has(stmt.name))
                        this.bind(scope, stmt.name, ANY);
                    this.declareSurface(stmt.body, scope);
                    break;
                case 'if':
                    for (const arm of stmt.arms)
                        this.declareSurface(arm.body, scope);
                    if (stmt.elseBody)
                        this.declareSurface(stmt.elseBody, scope);
                    break;
                case 'while':
                case 'repeat':
                    this.declareSurface(stmt.body, scope);
                    break;
                case 'try':
                    this.declareSurface(stmt.body, scope);
                    if (stmt.catchName && !scope.has(stmt.catchName))
                        this.bind(scope, stmt.catchName, ANY);
                    if (stmt.catchBody)
                        this.declareSurface(stmt.catchBody, scope);
                    if (stmt.finallyBody)
                        this.declareSurface(stmt.finallyBody, scope);
                    break;
                case 'assign':
                    if (stmt.target.kind === 'name' && !this.lookupBind(stmt.target.name) && !scope.has(stmt.target.name)) {
                        this.bind(scope, stmt.target.name, ANY);
                    }
                    break;
                default:
                    break;
            }
        }
    }
    rejectAccess(body) {
        for (const stmt of body) {
            if (stmt.kind !== 'class')
                continue;
            for (const field of stmt.fields) {
                if (field.access)
                    this.oops(field, `${field.access} belongs in a @strict class`);
            }
            for (const method of stmt.methods) {
                if (method.access)
                    this.oops(method, `${method.access} belongs in a @strict class`);
            }
        }
    }
    walkBody(body) {
        for (const stmt of body)
            this.walkStmt(stmt);
    }
    walkStmt(stmt) {
        switch (stmt.kind) {
            case 'import':
                return;
            case 'fn':
                this.walkFn(stmt.body, stmt.params, stmt.type);
                return;
            case 'class':
                this.walkClass(stmt);
                return;
            case 'let':
                if (stmt.init) {
                    const got = this.infer(stmt.init);
                    const bind = this.lookupBind(stmt.name);
                    if (bind) {
                        if (bind.declared.tag !== 'any')
                            this.assignCheck(stmt, got, bind.declared);
                        bind.inferred = got;
                    }
                }
                return;
            case 'assign':
                this.walkAssign(stmt);
                return;
            case 'print':
                for (const arg of stmt.args)
                    this.infer(arg);
                return;
            case 'expr':
                this.infer(stmt.expr);
                return;
            case 'return': {
                const got = stmt.value ? this.infer(stmt.value) : NIL;
                if (this.returnType)
                    this.assignCheck(stmt, got, this.returnType);
                return;
            }
            case 'throw':
                this.infer(stmt.value);
                return;
            case 'if':
                for (const arm of stmt.arms) {
                    this.infer(arm.test);
                    this.walkBody(arm.body);
                }
                if (stmt.elseBody)
                    this.walkBody(stmt.elseBody);
                return;
            case 'while':
                this.infer(stmt.test);
                this.walkBody(stmt.body);
                return;
            case 'repeat':
                this.walkBody(stmt.body);
                this.infer(stmt.test);
                return;
            case 'for':
                if (stmt.iter)
                    this.infer(stmt.iter);
                if (stmt.from)
                    this.infer(stmt.from);
                if (stmt.to)
                    this.infer(stmt.to);
                if (stmt.step)
                    this.infer(stmt.step);
                this.walkBody(stmt.body);
                return;
            case 'try':
                this.walkBody(stmt.body);
                if (stmt.catchBody)
                    this.walkBody(stmt.catchBody);
                if (stmt.finallyBody)
                    this.walkBody(stmt.finallyBody);
                return;
            default:
                return;
        }
    }
    walkFn(body, params, type) {
        const inner = new Map();
        for (const param of params)
            this.bind(inner, param.name, this.fromRef(param.type));
        const saved = this.returnType;
        this.returnType = type ? this.fromRef(type) : null;
        this.stack.push(inner);
        this.declareSurface(body, inner);
        this.walkBody(body);
        this.stack.pop();
        this.returnType = saved;
    }
    walkClass(stmt) {
        const saved = this.className;
        this.className = stmt.name;
        for (const field of stmt.fields) {
            this.assignCheck(field, this.infer(field.init), this.fromRef(field.type));
        }
        for (const method of stmt.methods) {
            this.walkFn(method.body, method.params, method.type);
        }
        this.className = saved;
    }
    walkAssign(stmt) {
        const value = this.infer(stmt.value);
        if (stmt.target.kind === 'name') {
            const bind = this.lookupBind(stmt.target.name);
            if (bind) {
                if (bind.declared.tag !== 'any')
                    this.assignCheck(stmt, value, bind.declared);
                else if (bind.inferred.tag !== 'any' && !this.assignable(value, bind.inferred))
                    bind.inferred = ANY;
                else
                    bind.inferred = value;
            }
            return;
        }
        if (stmt.target.kind === 'member') {
            const slot = this.memberType(stmt.target.object, stmt.target.name, stmt.target, true);
            this.assignCheck(stmt, value, slot);
            return;
        }
        this.infer(stmt.target);
    }
    infer(expr) {
        switch (expr.kind) {
            case 'number':
                return NUMBER;
            case 'string':
                return STRING;
            case 'bool':
                return BOOL;
            case 'nil':
                return NIL;
            case 'name':
                return this.lookup(expr.name) ?? ANY;
            case 'self':
                return this.className ? { tag: 'class', className: this.className } : ANY;
            case 'list':
                for (const item of expr.items)
                    this.infer(item);
                return LIST;
            case 'record':
                for (const field of expr.fields)
                    this.infer(field.value);
                return RECORD;
            case 'fn':
                this.walkFn(expr.body, expr.params, expr.type);
                return this.fnType(expr.params, expr.type);
            case 'unary':
                this.infer(expr.expr);
                if (expr.op === 'not')
                    return BOOL;
                return NUMBER;
            case 'binary':
                return this.inferBinary(expr);
            case 'call':
                return this.inferCall(expr);
            case 'member':
                return this.memberType(expr.object, expr.name, expr, false);
            case 'index':
                this.infer(expr.object);
                this.infer(expr.index);
                return ANY;
            case 'new':
                return this.inferConstruct(expr.callee, expr.args, expr);
            case 'super':
                for (const arg of expr.args)
                    this.infer(arg);
                return ANY;
            case 'await':
                this.infer(expr.expr);
                return ANY;
            default:
                return ANY;
        }
    }
    inferBinary(expr) {
        const left = this.infer(expr.left);
        const right = this.infer(expr.right);
        if (expr.op === 'and' || expr.op === 'or')
            return ANY;
        if (expr.op === '==' || expr.op === '!=' || expr.op === '<>' || expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=') {
            return BOOL;
        }
        if (expr.op === '&')
            return STRING;
        if (expr.op === '+' && (left.tag === 'string' || right.tag === 'string'))
            return STRING;
        return NUMBER;
    }
    inferCall(expr) {
        if (expr.callee.kind === 'name') {
            const info = this.classes.get(expr.callee.name);
            if (info) {
                this.checkArgs(expr, expr.args, info.ctor.params ?? []);
                this.checkCtorAccess(info, expr);
                return { tag: 'class', className: info.name };
            }
            if (this.lookupBind(expr.callee.name)?.declared === this.builtins.get(expr.callee.name)) {
                return this.builtinCall(expr.callee.name, expr.args, expr);
            }
        }
        const callee = this.infer(expr.callee);
        this.checkCallable(expr, callee);
        this.checkArgs(expr, expr.args, callee.params ?? []);
        return callee.returns ?? ANY;
    }
    inferConstruct(callee, args, node) {
        if (callee.kind === 'name') {
            const info = this.classes.get(callee.name);
            if (info) {
                this.checkArgs(node, args, info.ctor.params ?? []);
                this.checkCtorAccess(info, node);
                return { tag: 'class', className: info.name };
            }
        }
        this.infer(callee);
        for (const arg of args)
            this.infer(arg);
        return ANY;
    }
    seedBuiltins(top) {
        const specs = [
            ['len', [ANY], NUMBER],
            ['str', [ANY], STRING],
            ['num', [ANY], NUMBER],
            ['int', [ANY], NUMBER],
            ['type', [ANY], STRING],
            ['keys', [ANY], LIST],
            ['values', [ANY], LIST],
            ['push', [LIST, ANY], ANY],
            ['pop', [LIST], ANY],
            ['time', [], NUMBER],
            ['error', [ANY], ANY],
            ['sleep', [NUMBER], ANY],
            ['load', [STRING], ANY],
        ];
        for (const [name, params, returns] of specs) {
            const type = { tag: 'fn', params, returns };
            this.builtins.set(name, type);
            this.bind(top, name, type);
        }
    }
    builtinCall(name, args, node) {
        const spec = this.builtins.get(name);
        this.checkArgs(node, args, spec.params ?? [], name === 'push' || name === 'pop' ? name : null);
        return spec.returns ?? ANY;
    }
    checkCallable(node, callee) {
        if (callee.tag === 'any' || callee.tag === 'fn' || callee.tag === 'class')
            return;
        this.oops(node, `cannot call a ${this.label(callee)}`);
    }
    checkArgs(node, args, params, listWord = null) {
        void node;
        for (let i = 0; i < args.length; i += 1) {
            const got = this.infer(args[i]);
            const want = params[i];
            if (!want)
                continue;
            if (listWord && i === 0 && !this.assignable(got, LIST) && got.tag !== 'any' && got.tag !== 'nil') {
                this.oops(args[i], `${listWord} expects a list`);
            }
            this.assignCheck(args[i], got, want);
        }
    }
    checkCtorAccess(info, node) {
        const ctor = info.members.get('new');
        if (!ctor)
            return;
        this.assertAccess(info, 'new', ctor, node, false);
    }
    memberType(object, name, node, writing) {
        const obj = this.infer(object);
        if (obj.tag !== 'class' || !obj.className)
            return ANY;
        const found = this.findMember(obj.className, name);
        if (!found)
            return ANY;
        this.assertAccess(this.classes.get(found.from), name, found.member, node, writing);
        return found.member.type;
    }
    findMember(className, name) {
        let current = className;
        const seen = new Set();
        while (current && !seen.has(current)) {
            seen.add(current);
            const info = this.classes.get(current);
            if (!info)
                return null;
            const member = info.members.get(name);
            if (member)
                return { member, from: current };
            current = info.parent;
        }
        return null;
    }
    assertAccess(owner, name, member, node, _writing) {
        if (member.access === 'public')
            return;
        if (member.access === 'private') {
            if (this.className === owner.name)
                return;
            this.oops(node, `${name} is private on ${owner.name}`);
        }
        if (member.access === 'protected') {
            if (this.className && this.isSubclass(this.className, owner.name))
                return;
            this.oops(node, `${name} is protected on ${owner.name}`);
        }
    }
    isSubclass(child, parent) {
        let current = child;
        const seen = new Set();
        while (current && !seen.has(current)) {
            if (current === parent)
                return true;
            seen.add(current);
            current = this.classes.get(current)?.parent ?? null;
        }
        return false;
    }
    assignCheck(node, got, want) {
        if (this.assignable(got, want))
            return;
        this.oops(node, `cannot assign ${this.label(got)} to ${this.label(want)}`);
    }
    assignable(got, want) {
        if (want.tag === 'any' || got.tag === 'any' || got.tag === 'nil')
            return true;
        if (want.tag === 'nil')
            return false;
        if (got.tag === want.tag) {
            if (got.tag === 'class') {
                if (!want.className || !got.className)
                    return true;
                return this.isSubclass(got.className, want.className);
            }
            return true;
        }
        if (got.tag === 'class' && want.tag === 'record')
            return true;
        if (got.tag === 'fn' && want.tag === 'class')
            return false;
        return false;
    }
    fromRef(ref) {
        if (!ref)
            return ANY;
        const builtin = PRIMITIVE[ref.name.toLowerCase()];
        if (builtin)
            return builtin;
        const info = this.classes.get(ref.name);
        if (info)
            return { tag: 'class', className: info.name };
        return { tag: 'class', className: ref.name };
    }
    fnType(params, type) {
        return {
            tag: 'fn',
            params: params.map((param) => this.fromRef(param.type)),
            returns: type ? this.fromRef(type) : ANY,
        };
    }
    bind(scope, name, type) {
        scope.set(name, { declared: type, inferred: type });
    }
    lookupBind(name) {
        for (let i = this.stack.length - 1; i >= 0; i -= 1) {
            const hit = this.stack[i].get(name);
            if (hit)
                return hit;
        }
        return undefined;
    }
    lookup(name) {
        const bind = this.lookupBind(name);
        if (!bind)
            return undefined;
        if (bind.declared.tag !== 'any')
            return bind.declared;
        return bind.inferred;
    }
    label(type) {
        if (type.tag === 'class')
            return type.className ?? 'record';
        return type.tag;
    }
    oops(node, message) {
        throw new MagicError(message, node.line, node.column, this.filename);
    }
}
function fileAnnotations(program) {
    const list = [...program.annotations];
    for (const stmt of program.body) {
        if (stmt.annotations)
            list.push(...stmt.annotations);
    }
    return list;
}
//# sourceMappingURL=check.js.map