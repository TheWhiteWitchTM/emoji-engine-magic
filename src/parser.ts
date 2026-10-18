import type {
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
  Program,
  Stmt,
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

  constructor(filename = '') {
    this.filename = filename;
  }

  parse(source: string): Program {
    this.tokens = new Lexer(source, this.filename).tokenize();
    this.i = 0;
    const body = this.statements(new Set(['eof']));
    return { kind: 'program', body, line: 1, column: 1, filename: this.filename };
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
      body.push(this.statement());
      this.finish(stop);
    }
    return body;
  }

  private statement(): Stmt {
    const token = this.peek();
    if (token.kind === 'keyword') {
      switch (token.value) {
        case 'import':
          return this.importStmt();
        case 'fn':
          return this.fnStmt();
        case 'class':
          return this.classStmt();
        case 'if':
          return this.ifStmt();
        case 'while':
          return this.whileStmt();
        case 'for':
          return this.forStmt();
        case 'repeat':
          return this.repeatStmt();
        case 'return':
          return this.returnStmt();
        case 'break':
          this.next();
          return { kind: 'break', ...this.at(token) };
        case 'continue':
          this.next();
          return { kind: 'continue', ...this.at(token) };
        case 'let':
          return this.letStmt();
        case 'print':
          return this.printStmt();
        case 'end':
        case 'else':
        case 'elseif':
        case 'until':
        case 'then':
        case 'from':
          this.fail(token, `unexpected ${token.value}`);
          break;
        default:
          break;
      }
    }
    return this.assignOrCall();
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
      const imported = this.expectIdent();
      const local = this.eatWord('as') ? this.expectIdent() : imported;
      names.push({ imported, local });
    } while (this.eatOp(','));
    this.expectKeyword('from');
    const specifier = this.expectKind('string', 'expected a module name in quotes').value;
    return { kind: 'import', form: 'named', specifier, alias: null, names, ...this.at(start) };
  }

  private fnStmt(): FnStmt {
    const start = this.next();
    if (this.peek().kind !== 'ident') {
      this.fail(this.peek(), 'this function needs a name. Use fn name(), or fn() inside an expression');
    }
    const name = this.expectIdent();
    const params = this.params();
    const body = this.statements(new Set(['end']));
    this.expectKeyword('end');
    return { kind: 'fn', name, params, body, ...this.at(start) };
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
      if (token.kind === 'keyword' && token.value === 'fn') {
        const method = this.method();
        if (used.has(method.name)) this.fail(method, `${method.name} is already in class ${name}`);
        used.add(method.name);
        methods.push(method);
        continue;
      }
      if (token.kind === 'keyword' && token.value === 'let') this.next();
      if (this.peek().kind !== 'ident') this.fail(this.peek(), 'a class holds fields and fn methods');
      const fieldName = this.expectIdent();
      if (fieldName === 'new') this.fail(token, 'new is the constructor. Write fn new()');
      if (used.has(fieldName)) this.fail(token, `${fieldName} is already in class ${name}`);
      used.add(fieldName);
      if (!this.eatOp('=')) this.fail(this.peek(), `field ${fieldName} needs = and a value`);
      this.skipNl();
      const init = this.expression();
      fields.push({ name: fieldName, init, ...this.at(token) });
      this.finish(new Set(['end']));
    }
    this.expectKeyword('end');
    return { kind: 'class', name, parent, fields, methods, ...this.at(start) };
  }

  private method(): MethodStmt {
    const start = this.next();
    const name = this.methodName();
    const params = this.params();
    const body = this.statements(new Set(['end']));
    this.expectKeyword('end');
    return { name, params, body, ...this.at(start) };
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
    if (!this.eatOp('=')) return { kind: 'let', name, init: null, ...this.at(start) };
    this.skipNl();
    return { kind: 'let', name, init: this.expression(), ...this.at(start) };
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
    if (expr.kind !== 'call' && expr.kind !== 'super') {
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
    if (token.kind === 'keyword' && token.value === 'fn') return this.fnExpr();
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

  private fnExpr(): FnExpr {
    const start = this.next();
    if (this.peek().kind === 'ident') {
      this.fail(this.peek(), 'a named fn is a statement. Here, write fn(x)');
    }
    const params = this.params();
    const body = this.statements(new Set(['end']));
    this.expectKeyword('end');
    return { kind: 'fn', params, body, ...this.at(start) };
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

  private params(): string[] {
    this.expectOp('(');
    const names: string[] = [];
    this.skipNl();
    if (this.eatOp(')')) return names;
    for (;;) {
      const mark = this.peek();
      const name = this.expectIdent();
      if (names.includes(name)) this.fail(mark, `${name} is already a parameter`);
      names.push(name);
      this.skipNl();
      if (!this.eatOp(',')) break;
      this.skipNl();
      if (this.peek().kind === 'op' && this.peek().value === ')') break;
    }
    this.expectOp(')');
    return names;
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
      return token.value === 'end' || token.value === 'else' || token.value === 'elseif' || token.value === 'until';
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
}
