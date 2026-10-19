import type {
  Access,
  Annotation,
  AssignOp,
  ClassStmt,
  Expr,
  FieldStmt,
  FnExpr,
  FnStmt,
  ForStmt,
  IfStmt,
  ImportStmt,
  MethodStmt,
  Node,
  Param,
  Program,
  Stmt,
  TryStmt,
  TypeRef,
} from './ast.js';
import { MagicError } from './error.js';
import { Lexer } from './lexer.js';
import type { Token } from './token.js';

/** JavaScript words that cannot be Magic names, because the script compiles to JavaScript. */
const JS_RESERVED = new Set([
  'await',
  'arguments',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

const ASSIGN: Record<string, AssignOp> = {
  '=': '=',
  '+=': '+=',
  '-=': '-=',
  '*=': '*=',
  '/=': '/=',
};

/**
 * Turns tokens into a tree. One word closes every block: `end`.
 * `then` and `do` are optional. Names keep their case. Keywords do not.
 */
export class Parser {
  private tokens: Token[] = [];
  private i = 0;
  private readonly filename: string;
  private trailingAnnotations: Annotation[] = [];

  constructor(filename = '') {
    this.filename = filename;
  }

  parse(source: string): Program {
    this.tokens = new Lexer(source, this.filename).tokenize();
    this.i = 0;
    this.trailingAnnotations = [];
    const body = this.statements(new Set(['eof']));
    return {
      kind: 'program',
      body,
      line: 1,
      column: 1,
      filename: this.filename,
      annotations: this.trailingAnnotations,
    };
  }

  private statements(stop: Set<string>): Stmt[] {
    const body: Stmt[] = [];
    for (;;) {
      this.skipNl();
      const token = this.peek();
      if (token.kind === 'eof') {
        if (!stop.has('eof')) this.fail(token, `expected ${this.stopText(stop)}`);
        break;
      }
      if (token.kind === 'keyword' && stop.has(token.value)) break;
      const annotations = this.takeAnnotations();
      this.skipNl();
      const next = this.peek();
      if (next.kind === 'eof' || (next.kind === 'keyword' && stop.has(next.value))) {
        if (next.kind === 'eof') {
          if (!stop.has('eof')) this.fail(next, `expected ${this.stopText(stop)}`);
          this.trailingAnnotations = annotations;
          break;
        }
        if (annotations.length) this.fail(annotations[0]!, 'this annotation needs a statement');
        break;
      }
      body.push(this.statement(annotations));
      this.finish(stop);
    }
    return body;
  }

  private statement(annotations: Annotation[] = []): Stmt {
    const token = this.peek();
    if (token.kind === 'keyword') {
      switch (token.value) {
        case 'import':
          return this.tag(this.importStmt(), annotations);
        case 'fn':
          return this.tag(this.fnStmt(false), annotations);
        case 'class':
          return this.tag(this.classStmt(), annotations);
        case 'if':
          return this.tag(this.ifStmt(), annotations);
        case 'while':
          return this.tag(this.whileStmt(), annotations);
        case 'for':
          return this.tag(this.forStmt(), annotations);
        case 'repeat':
          return this.tag(this.repeatStmt(), annotations);
        case 'return':
          return this.tag(this.returnStmt(), annotations);
        case 'break':
          this.next();
          return this.tag({ kind: 'break', ...this.at(token) }, annotations);
        case 'continue':
          this.next();
          return this.tag({ kind: 'continue', ...this.at(token) }, annotations);
        case 'let':
          return this.tag(this.letStmt(), annotations);
        case 'print':
          return this.tag(this.printStmt(), annotations);
        case 'try':
          return this.tag(this.tryStmt(), annotations);
        case 'throw':
          return this.tag(this.throwStmt(), annotations);
        case 'end':
        case 'else':
        case 'elseif':
        case 'until':
        case 'then':
        case 'from':
        case 'catch':
        case 'finally':
          this.fail(token, `unexpected ${token.value}`);
          break;
        default:
          break;
      }
    }
    if (this.startsAsyncFn()) {
      this.next();
      this.skipNl();
      return this.tag(this.fnStmt(true), annotations);
    }
    return this.tag(this.assignOrCall(), annotations);
  }

  private importStmt(): ImportStmt {
    const start = this.next();
    if (this.peek().kind === 'string') {
      const specifier = this.next().value;
      if (this.eatWord('as')) {
        const alias = this.expectIdent();
        return { kind: 'import', form: 'namespace', specifier, alias, names: [], ...this.at(start) };
      }
      return { kind: 'import', form: 'side', specifier, alias: null, names: [], ...this.at(start) };
    }
    const names: ImportStmt['names'] = [];
    do {
      const imported = this.expectImportedName();
      const local = this.eatWord('as') ? this.expectIdent() : this.asLocalName(imported);
      names.push({ imported, local });
    } while (this.eatOp(','));
    this.expectKeyword('from');
    const specifier = this.expectKind('string', 'expected a module name in quotes').value;
    return { kind: 'import', form: 'named', specifier, alias: null, names, ...this.at(start) };
  }

  private fnStmt(async: boolean): FnStmt {
    const start = this.next();
    if (this.peek().kind !== 'ident') {
      this.fail(this.peek(), 'this function needs a name. Use fn name(), or fn() inside an expression');
    }
    const name = this.expectIdent();
    const params = this.params();
    const type = this.parseAsType();
    const body = this.statements(new Set(['end']));
    this.expectKeyword('end');
    return { kind: 'fn', name, params, body, async, type, ...this.at(start) };
  }

  private classStmt(): ClassStmt {
    const start = this.next();
    const name = this.expectIdent();
    const parent = this.eatWord('is') ? this.expectIdent() : null;
    const fields: FieldStmt[] = [];
    const methods: MethodStmt[] = [];
    const used = new Set<string>();
    for (;;) {
      this.skipNl();
      const token = this.peek();
      if (token.kind === 'eof') this.fail(token, `expected end to close class ${name}`);
      if (token.kind === 'keyword' && token.value === 'end') break;
      const annotations = this.takeAnnotations();
      this.skipNl();
      if (this.peek().kind === 'keyword' && this.peek().value === 'end') {
        if (annotations.length) this.fail(annotations[0]!, 'this annotation needs a statement');
        break;
      }
      const access = this.accessWord();
      const memberStart = this.peek();
      const asyncMethod = this.startsAsyncFn();
      if (asyncMethod || (memberStart.kind === 'keyword' && memberStart.value === 'fn')) {
        if (asyncMethod) {
          this.next();
          this.skipNl();
        }
        const method = this.method(asyncMethod);
        this.tag(method, annotations);
        method.access = this.mergeAccess(access, annotations, method);
        if (used.has(method.name)) this.fail(method, `${method.name} is already in class ${name}`);
        used.add(method.name);
        methods.push(method);
        continue;
      }
      if (memberStart.kind === 'keyword' && memberStart.value === 'let') this.next();
      if (this.peek().kind !== 'ident') this.fail(this.peek(), 'a class holds fields and fn methods');
      const fieldToken = this.peek();
      const fieldName = this.expectIdent();
      if (fieldName === 'new') this.fail(fieldToken, 'new is the constructor. Write fn new()');
      if (used.has(fieldName)) this.fail(fieldToken, `${fieldName} is already in class ${name}`);
      used.add(fieldName);
      const fieldType = this.parseAsType();
      if (!this.eatOp('=')) this.fail(this.peek(), `field ${fieldName} needs = and a value`);
      this.skipNl();
      const init = this.expression();
      const field: FieldStmt = {
        name: fieldName,
        init,
        access: null,
        type: fieldType,
        ...this.at(fieldToken),
      };
      this.tag(field, annotations);
      field.access = this.mergeAccess(access, annotations, field);
      fields.push(field);
      this.finish(new Set(['end']));
    }
    this.expectKeyword('end');
    return { kind: 'class', name, parent, fields, methods, ...this.at(start) };
  }

  private method(async: boolean): MethodStmt {
    const start = this.next();
    const name = this.methodName();
    if (async && name === 'new') this.fail(start, 'fn new cannot be async');
    const params = this.params();
    const type = this.parseAsType();
    const body = this.statements(new Set(['end']));
    this.expectKeyword('end');
    return { name, params, body, async, access: null, type, ...this.at(start) };
  }

  private ifStmt(): IfStmt {
    const start = this.next();
    const arms: IfStmt['arms'] = [];
    const first = this.condition();
    this.eatWord('then');
    arms.push({ test: first, body: this.statements(new Set(['end', 'else', 'elseif'])), ...this.at(start) });
    for (;;) {
      if (this.peek().kind === 'keyword' && this.peek().value === 'elseif') {
        const mark = this.next();
        const test = this.condition();
        this.eatWord('then');
        arms.push({ test, body: this.statements(new Set(['end', 'else', 'elseif'])), ...this.at(mark) });
        continue;
      }
      if (this.peek().kind === 'keyword' && this.peek().value === 'else') {
        const elseToken = this.peek();
        const next = this.peek(1);
        if (next.kind === 'keyword' && next.value === 'if' && next.line === elseToken.line) {
          this.next();
          const mark = this.next();
          const test = this.condition();
          this.eatWord('then');
          arms.push({ test, body: this.statements(new Set(['end', 'else', 'elseif'])), ...this.at(mark) });
          continue;
        }
        this.next();
        const elseBody = this.statements(new Set(['end']));
        this.expectKeyword('end');
        return { kind: 'if', arms, elseBody, ...this.at(start) };
      }
      break;
    }
    this.expectKeyword('end');
    return { kind: 'if', arms, elseBody: null, ...this.at(start) };
  }

  private whileStmt(): Stmt {
    const start = this.next();
    const test = this.condition();
    this.eatWord('do');
    const body = this.statements(new Set(['end']));
    this.expectKeyword('end');
    return { kind: 'while', test, body, ...this.at(start) };
  }

  private forStmt(): ForStmt {
    const start = this.next();
    const name = this.expectIdent();
    if (this.eatOp('=')) {
      const from = this.expression();
      if (!this.eatWord('to')) this.fail(this.peek(), 'for i = start to stop');
      const to = this.expression();
      const step = this.eatWord('step') ? this.expression() : null;
      this.eatWord('do');
      const body = this.statements(new Set(['end']));
      this.expectKeyword('end');
      return { kind: 'for', name, from, to, step, iter: null, body, ...this.at(start) };
    }
    if (this.eatWord('in')) {
      const iter = this.expression();
      this.eatWord('do');
      const body = this.statements(new Set(['end']));
      this.expectKeyword('end');
      return { kind: 'for', name, from: null, to: null, step: null, iter, body, ...this.at(start) };
    }
    this.fail(this.peek(), 'for i = start to stop, or for item in list');
  }

  private repeatStmt(): Stmt {
    const start = this.next();
    const body = this.statements(new Set(['until']));
    this.expectKeyword('until');
    const test = this.condition();
    return { kind: 'repeat', body, test, ...this.at(start) };
  }

  private returnStmt(): Stmt {
    const start = this.next();
    if (this.closes()) return { kind: 'return', value: null, ...this.at(start) };
    return { kind: 'return', value: this.expression(), ...this.at(start) };
  }

  private letStmt(): Stmt {
    const start = this.next();
    const name = this.expectIdent();
    const type = this.parseAsType();
    if (!this.eatOp('=')) return { kind: 'let', name, init: null, type, ...this.at(start) };
    this.skipNl();
    return { kind: 'let', name, init: this.expression(), type, ...this.at(start) };
  }

  private printStmt(): Stmt {
    const start = this.next();
    if (this.closes()) return { kind: 'print', args: [], ...this.at(start) };
    const args = [this.expression()];
    while (this.eatOp(',')) {
      this.skipNl();
      args.push(this.expression());
    }
    return { kind: 'print', args, ...this.at(start) };
  }

  private tryStmt(): TryStmt {
    const start = this.next();
    const body = this.statements(new Set(['end', 'catch', 'finally']));
    let catchName: string | null = null;
    let catchBody: Stmt[] | null = null;
    let finallyBody: Stmt[] | null = null;
    if (this.peek().kind === 'keyword' && this.peek().value === 'catch') {
      const mark = this.next();
      if (this.peek().kind === 'ident' && this.peek().line === mark.line) {
        catchName = this.expectIdent();
      }
      catchBody = this.statements(new Set(['end', 'finally']));
    }
    if (this.peek().kind === 'keyword' && this.peek().value === 'finally') {
      this.next();
      finallyBody = this.statements(new Set(['end']));
    }
    if (!catchBody && !finallyBody) this.fail(start, 'try needs catch or finally');
    this.expectKeyword('end');
    return { kind: 'try', body, catchName, catchBody, finallyBody, ...this.at(start) };
  }

  private throwStmt(): Stmt {
    const start = this.next();
    this.skipNl();
    if (this.closes()) this.fail(start, 'throw needs a value');
    return { kind: 'throw', value: this.expression(), ...this.at(start) };
  }

  private assignOrCall(): Stmt {
    const start = this.peek();
    const expr = this.expression();
    const op = this.peek();
    if (op.kind === 'op' && ASSIGN[op.value]) {
      this.next();
      if (!this.isTarget(expr)) this.fail(start, 'this cannot be assigned to');
      this.skipNl();
      const value = this.expression();
      return { kind: 'assign', target: expr, op: ASSIGN[op.value]!, value, ...this.at(start) };
    }
    if (expr.kind !== 'call' && expr.kind !== 'super' && expr.kind !== 'await') {
      this.fail(start, 'this value is unused. Call a function, or assign with =');
    }
    return { kind: 'expr', expr, ...this.at(start) };
  }

  private condition(): Expr {
    const expr = this.expression();
    const next = this.peek();
    if (next.kind === 'op' && next.value === '=') {
      this.fail(next, 'use == to compare. = assigns a value');
    }
    return expr;
  }

  private expression(min = 0): Expr {
    let left = this.unary();
    for (;;) {
      const op = this.binaryOp(this.peek());
      if (!op || op.prec < min) break;
      this.next();
      this.skipNl();
      const nextMin = op.right ? op.prec : op.prec + 1;
      const right = this.expression(nextMin);
      left = { kind: 'binary', op: op.op, left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private unary(): Expr {
    const token = this.peek();
    if (token.kind === 'keyword' && token.value === 'not') {
      this.next();
      this.skipNl();
      return { kind: 'unary', op: 'not', expr: this.expression(3), ...this.at(token) };
    }
    if (token.kind === 'keyword' && token.value === 'await') {
      this.next();
      this.skipNl();
      return { kind: 'await', expr: this.expression(8), ...this.at(token) };
    }
    if (token.kind === 'keyword' && token.value === 'new') return this.newExpr();
    if (token.kind === 'op' && token.value === '-') {
      this.next();
      this.skipNl();
      return { kind: 'unary', op: '-', expr: this.expression(8), ...this.at(token) };
    }
    if (token.kind === 'op' && token.value === '#') {
      this.next();
      this.skipNl();
      return { kind: 'unary', op: '#', expr: this.expression(8), ...this.at(token) };
    }
    return this.postfix();
  }

  private newExpr(): Expr {
    const start = this.next();
    let callee = this.primary();
    callee = this.memberChain(callee);
    if (!this.eatOp('(')) this.fail(this.peek(), 'new needs a call, like new Engine({})');
    const args = this.argList();
    this.expectOp(')');
    let expr: Expr = { kind: 'new', callee, args, ...this.at(start) };
    expr = this.memberChain(expr);
    while (this.peek().kind === 'op' && this.peek().value === '(') {
      expr = this.callAfter(expr);
    }
    return expr;
  }

  private postfix(): Expr {
    let expr = this.primary();
    for (;;) {
      if (this.peek().kind === 'op' && this.peek().value === '(') {
        expr = this.callAfter(expr);
        continue;
      }
      if (this.peek().kind === 'string' && (expr.kind === 'name' || expr.kind === 'member')) {
        const text = this.next();
        expr = {
          kind: 'call',
          callee: expr,
          args: [{ kind: 'string', value: text.value, ...this.at(text) }],
          ...this.at(text),
        };
        continue;
      }
      const chained = this.oneMember(expr);
      if (!chained) break;
      expr = chained;
    }
    return expr;
  }

  private memberChain(expr: Expr): Expr {
    let current = expr;
    for (;;) {
      const next = this.oneMember(current);
      if (!next) return current;
      current = next;
    }
  }

  private oneMember(expr: Expr): Expr | null {
    if (this.eatOp('.')) {
      const name = this.expectMemberName();
      return { kind: 'member', object: expr, name, line: expr.line, column: expr.column };
    }
    if (this.eatOp('[')) {
      this.skipNl();
      const index = this.expression();
      this.skipNl();
      this.expectOp(']');
      return { kind: 'index', object: expr, index, line: expr.line, column: expr.column };
    }
    return null;
  }

  private callAfter(expr: Expr): Expr {
    const mark = this.next();
    const args = this.argList();
    this.expectOp(')');
    return { kind: 'call', callee: expr, args, ...this.at(mark) };
  }

  private primary(): Expr {
    const token = this.peek();
    if (token.kind === 'number') {
      this.next();
      const value = Number(token.value);
      if (!Number.isFinite(value)) this.fail(token, 'that number is not usable');
      return { kind: 'number', raw: token.value, value, ...this.at(token) };
    }
    if (token.kind === 'string') {
      this.next();
      return { kind: 'string', value: token.value, ...this.at(token) };
    }
    if (token.kind === 'keyword' && token.value === 'true') {
      this.next();
      return { kind: 'bool', value: true, ...this.at(token) };
    }
    if (token.kind === 'keyword' && token.value === 'false') {
      this.next();
      return { kind: 'bool', value: false, ...this.at(token) };
    }
    if (token.kind === 'keyword' && token.value === 'nil') {
      this.next();
      return { kind: 'nil', ...this.at(token) };
    }
    if (token.kind === 'keyword' && token.value === 'self') {
      this.next();
      return { kind: 'self', ...this.at(token) };
    }
    if (token.kind === 'keyword' && token.value === 'super') return this.superExpr();
    if (token.kind === 'keyword' && token.value === 'fn') return this.fnExpr(false);
    if (this.startsAsyncFn()) {
      this.next();
      this.skipNl();
      return this.fnExpr(true);
    }
    if (token.kind === 'ident') {
      this.next();
      return { kind: 'name', name: token.value, ...this.at(token) };
    }
    if (token.kind === 'op' && token.value === '(') return this.group();
    if (token.kind === 'op' && token.value === '[') return this.list();
    if (token.kind === 'op' && token.value === '{') return this.record();
    this.fail(token, 'expected a value');
  }

  private superExpr(): Expr {
    const start = this.next();
    if (this.eatOp('.')) {
      const method = this.expectMemberName();
      if (!this.eatOp('(')) this.fail(this.peek(), `super.${method} needs ()`);
      const args = this.argList();
      this.expectOp(')');
      return { kind: 'super', method, args, ...this.at(start) };
    }
    if (!this.eatOp('(')) this.fail(this.peek(), 'super needs (), or super.method()');
    const args = this.argList();
    this.expectOp(')');
    return { kind: 'super', method: null, args, ...this.at(start) };
  }

  private fnExpr(async: boolean): FnExpr {
    const start = this.next();
    if (this.peek().kind === 'ident') {
      this.fail(this.peek(), 'a named fn is a statement. Here, write fn(x)');
    }
    const params = this.params();
    const type = this.parseAsType();
    const body = this.statements(new Set(['end']));
    this.expectKeyword('end');
    return { kind: 'fn', params, body, async, type, ...this.at(start) };
  }

  private group(): Expr {
    this.next();
    this.skipNl();
    const expr = this.expression();
    this.skipNl();
    this.expectOp(')');
    return expr;
  }

  private list(): Expr {
    const start = this.next();
    const items: Expr[] = [];
    this.skipNl();
    if (!this.eatOp(']')) {
      for (;;) {
        items.push(this.expression());
        this.skipNl();
        if (!this.eatOp(',')) break;
        this.skipNl();
        if (this.peek().kind === 'op' && this.peek().value === ']') break;
      }
      this.expectOp(']');
    }
    return { kind: 'list', items, ...this.at(start) };
  }

  private record(): Expr {
    const start = this.next();
    const fields: { name: string; value: Expr }[] = [];
    this.skipNl();
    if (!this.eatOp('}')) {
      for (;;) {
        const key = this.peek();
        let name = '';
        if (key.kind === 'ident') name = this.expectMemberName();
        else if (key.kind === 'string') {
          this.next();
          name = key.value;
        } else this.fail(key, 'a record field needs a name');
        if (!this.eatOp(':')) this.fail(this.peek(), `field ${name} needs : and a value`);
        this.skipNl();
        fields.push({ name, value: this.expression() });
        this.skipNl();
        if (!this.eatOp(',')) break;
        this.skipNl();
        if (this.peek().kind === 'op' && this.peek().value === '}') break;
      }
      this.expectOp('}');
    }
    return { kind: 'record', fields, ...this.at(start) };
  }

  private params(): Param[] {
    this.expectOp('(');
    const params: Param[] = [];
    this.skipNl();
    if (this.eatOp(')')) return params;
    for (;;) {
      const mark = this.peek();
      const name = this.expectIdent();
      if (params.some((param) => param.name === name)) this.fail(mark, `${name} is already a parameter`);
      const type = this.parseAsType();
      params.push({ name, type, ...this.at(mark) });
      this.skipNl();
      if (!this.eatOp(',')) break;
      this.skipNl();
      if (this.peek().kind === 'op' && this.peek().value === ')') break;
    }
    this.expectOp(')');
    return params;
  }

  private argList(): Expr[] {
    const args: Expr[] = [];
    this.skipNl();
    if (this.peek().kind === 'op' && this.peek().value === ')') return args;
    for (;;) {
      args.push(this.expression());
      this.skipNl();
      if (!this.eatOp(',')) break;
      this.skipNl();
      if (this.peek().kind === 'op' && this.peek().value === ')') break;
    }
    return args;
  }

  private binaryOp(token: Token): { op: string; prec: number; right: boolean } | null {
    if (token.kind === 'keyword' && token.value === 'or') return { op: 'or', prec: 1, right: false };
    if (token.kind === 'keyword' && token.value === 'and') return { op: 'and', prec: 2, right: false };
    if (token.kind === 'ident' && token.value.toLowerCase() === 'mod') return { op: '%', prec: 6, right: false };
    if (token.kind !== 'op') return null;
    switch (token.value) {
      case '==':
      case '!=':
      case '<>':
      case '<':
      case '>':
      case '<=':
      case '>=':
        return { op: token.value, prec: 3, right: false };
      case '..':
      case '&':
        return { op: '&', prec: 4, right: false };
      case '+':
      case '-':
        return { op: token.value, prec: 5, right: false };
      case '*':
      case '/':
      case '%':
        return { op: token.value, prec: 6, right: false };
      case '^':
        return { op: '^', prec: 8, right: true };
      default:
        return null;
    }
  }

  private isTarget(expr: Expr): boolean {
    return expr.kind === 'name' || expr.kind === 'member' || expr.kind === 'index';
  }

  private closes(): boolean {
    const token = this.peek();
    if (token.kind === 'eof' || token.kind === 'newline') return true;
    if (token.kind === 'op' && (token.value === ':' || token.value === ';')) return true;
    if (token.kind === 'keyword') {
      return (
        token.value === 'end' ||
        token.value === 'else' ||
        token.value === 'elseif' ||
        token.value === 'until' ||
        token.value === 'catch' ||
        token.value === 'finally'
      );
    }
    return false;
  }

  private finish(stop: Set<string>): void {
    const token = this.peek();
    if (token.kind === 'eof') return;
    if (token.kind === 'newline') {
      this.next();
      return;
    }
    if (token.kind === 'op' && (token.value === ':' || token.value === ';')) {
      this.next();
      return;
    }
    if (token.kind === 'keyword' && stop.has(token.value)) return;
    this.fail(token, 'expected a new line or : before this');
  }

  /** A property can use a JavaScript word. A variable cannot. */
  private expectMemberName(): string {
    const token = this.peek();
    if (token.kind !== 'ident') this.fail(token, 'expected a name');
    this.next();
    if (token.value.startsWith('__magic')) this.fail(token, 'names cannot start with __magic');
    return token.value;
  }

  /** `async` is a word before `fn`. It can still be a variable name. */
  private startsAsyncFn(): boolean {
    const token = this.peek();
    if (token.kind !== 'ident' || token.value.toLowerCase() !== 'async') return false;
    let offset = 1;
    while (this.peek(offset).kind === 'newline') offset += 1;
    const next = this.peek(offset);
    return next.kind === 'keyword' && next.value === 'fn';
  }

  /**
   * A name as it is exported by another module. JavaScript may export `default`
   * or a reserved word. The local binding still has to be a Magic name.
   */
  private expectImportedName(): string {
    const token = this.peek();
    if (token.kind !== 'ident' && token.kind !== 'keyword') this.fail(token, 'expected a name');
    this.next();
    if (token.value.startsWith('__magic')) this.fail(token, 'names cannot start with __magic');
    return token.value;
  }

  private asLocalName(imported: string): string {
    const token = this.peek();
    if (imported.startsWith('__magic')) this.fail(token, 'names cannot start with __magic');
    if (JS_RESERVED.has(imported)) this.fail(token, `${imported} is reserved. Pick another name`);
    const lower = imported.toLowerCase();
    if (
      lower === 'import' ||
      lower === 'from' ||
      lower === 'class' ||
      lower === 'fn' ||
      lower === 'end' ||
      lower === 'if' ||
      lower === 'then' ||
      lower === 'else' ||
      lower === 'elseif' ||
      lower === 'for' ||
      lower === 'while' ||
      lower === 'repeat' ||
      lower === 'until' ||
      lower === 'return' ||
      lower === 'break' ||
      lower === 'continue' ||
      lower === 'let' ||
      lower === 'print' ||
      lower === 'and' ||
      lower === 'or' ||
      lower === 'not' ||
      lower === 'true' ||
      lower === 'false' ||
      lower === 'nil' ||
      lower === 'new' ||
      lower === 'self' ||
      lower === 'super' ||
      lower === 'try' ||
      lower === 'catch' ||
      lower === 'finally' ||
      lower === 'throw' ||
      lower === 'await'
    ) {
      this.fail(token, `${imported} is a Magic word. Pick another name`);
    }
    return imported;
  }

  /** `fn new` is the constructor. `new` stays a keyword everywhere else. */
  private methodName(): string {
    const token = this.peek();
    if (token.kind === 'keyword' && token.value === 'new') {
      this.next();
      return 'new';
    }
    return this.expectIdent();
  }

  private expectIdent(): string {
    const token = this.peek();
    if (token.kind === 'keyword') this.fail(token, `${token.value} is a Magic word. Pick another name`);
    this.expectKind('ident', 'expected a name');
    if (token.value.startsWith('__magic')) {
      this.fail(token, 'names cannot start with __magic');
    }
    if (JS_RESERVED.has(token.value)) {
      this.fail(token, `${token.value} is reserved. Pick another name`);
    }
    return token.value;
  }

  private expectKeyword(value: string): Token {
    const token = this.peek();
    if (token.kind === 'keyword' && token.value === value) return this.next();
    this.fail(token, `expected ${value}`);
  }

  private expectOp(value: string): Token {
    const token = this.peek();
    if (token.kind === 'op' && token.value === value) return this.next();
    this.fail(token, `expected ${value}`);
  }

  private expectKind(kind: Token['kind'], message: string): Token {
    const token = this.peek();
    if (token.kind !== kind) this.fail(token, message);
    return this.next();
  }

  private eatOp(value: string): boolean {
    if (this.peek().kind === 'op' && this.peek().value === value) {
      this.next();
      return true;
    }
    return false;
  }

  private eatWord(word: string): boolean {
    const token = this.peek();
    const wordLike = token.kind === 'ident' || token.kind === 'keyword';
    if (wordLike && token.value.toLowerCase() === word) {
      this.next();
      return true;
    }
    return false;
  }

  private skipNl(): void {
    while (this.peek().kind === 'newline') this.next();
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.i += 1;
    return token;
  }

  private at(token: Token): Node {
    return { line: token.line, column: token.column };
  }

  private stopText(stop: Set<string>): string {
    const words = [...stop].filter((word) => word !== 'eof');
    return words.length > 0 ? words.join(' or ') : 'end';
  }

  private fail(token: { line: number; column: number }, message: string): never {
    throw new MagicError(message, token.line, token.column, this.filename);
  }

  private tag<T extends Node>(node: T, annotations: Annotation[]): T {
    if (annotations.length) node.annotations = annotations;
    return node;
  }

  private takeAnnotations(): Annotation[] {
    const list: Annotation[] = [];
    for (;;) {
      this.skipNl();
      if (this.peek().kind !== 'op' || this.peek().value !== '@') break;
      list.push(this.annotation());
      const sep = this.peek();
      if (sep.kind === 'op' && (sep.value === ':' || sep.value === ';')) this.next();
    }
    return list;
  }

  private annotation(): Annotation {
    const start = this.next();
    const nameToken = this.peek();
    if (nameToken.kind !== 'ident') this.fail(nameToken, 'expected a name after @');
    this.next();
    if (nameToken.value.startsWith('__magic')) this.fail(nameToken, 'names cannot start with __magic');
    const args: Expr[] = [];
    if (this.eatOp('(')) {
      this.skipNl();
      if (!this.eatOp(')')) {
        for (;;) {
          args.push(this.expression());
          this.skipNl();
          if (!this.eatOp(',')) break;
          this.skipNl();
          if (this.peek().kind === 'op' && this.peek().value === ')') break;
        }
        this.expectOp(')');
      }
    }
    return { name: nameToken.value.toLowerCase(), args, ...this.at(start) };
  }

  private parseAsType(): TypeRef | null {
    if (!this.eatWord('as')) return null;
    this.skipNl();
    return this.parseType();
  }

  private parseType(): TypeRef {
    const token = this.peek();
    if (token.kind === 'keyword' && (token.value === 'fn' || token.value === 'nil')) {
      this.next();
      return { name: token.value, ...this.at(token) };
    }
    if (token.kind !== 'ident') this.fail(token, 'expected a type name');
    this.next();
    if (token.value.startsWith('__magic')) this.fail(token, 'names cannot start with __magic');
    return { name: token.value, ...this.at(token) };
  }

  private accessWord(): Access | null {
    const token = this.peek();
    if (token.kind !== 'ident') return null;
    const word = token.value.toLowerCase();
    if (word !== 'public' && word !== 'private' && word !== 'protected') return null;
    this.next();
    this.skipNl();
    return word;
  }

  private mergeAccess(word: Access | null, annotations: Annotation[], node: Node): Access | null {
    let fromAnn: Access | null = null;
    for (const ann of annotations) {
      if (ann.name === 'public' || ann.name === 'private' || ann.name === 'protected') {
        if (fromAnn && fromAnn !== ann.name) {
          this.fail(ann, `${fromAnn} and ${ann.name} disagree`);
        }
        fromAnn = ann.name;
      }
    }
    if (word && fromAnn && word !== fromAnn) this.fail(node, `${word} and ${fromAnn} disagree`);
    return word ?? fromAnn;
  }
}
