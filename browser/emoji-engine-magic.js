"use strict";
var EmojiEngineMagic = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // dist/browser.js
  var browser_exports = {};
  __export(browser_exports, {
    Compiler: () => Compiler,
    Lexer: () => Lexer,
    MagicError: () => MagicError,
    Parser: () => Parser,
    compile: () => compile
  });

  // dist/engines.js
  var ENGINES = {
    "2d": {
      name: "2d",
      package: "emoji-engine-2d",
      global: "EmojiEngine",
      file: "emoji-engine-2d.js"
    },
    "3d": {
      name: "3d",
      package: "emoji-engine-3d",
      global: "EmojiEngine3D",
      file: "emoji-engine-3d.js"
    },
    ui: {
      name: "ui",
      package: "emoji-engine-ui",
      global: "EmojiEngineUI",
      file: "emoji-engine-ui.js"
    }
  };
  var ALIASES = {
    "2d": "2d",
    "emoji-engine-2d": "2d",
    "3d": "3d",
    "emoji-engine-3d": "3d",
    ui: "ui",
    "emoji-engine-ui": "ui"
  };
  function engineKey(specifier) {
    return ALIASES[specifier] ?? null;
  }
  function isMagicSpecifier(specifier) {
    if (engineKey(specifier))
      return false;
    if (specifier.endsWith(".magic"))
      return true;
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      if (/\.(js|mjs|cjs|json)$/.test(specifier))
        return false;
      return true;
    }
    return false;
  }

  // dist/error.js
  var MagicError = class extends Error {
    line;
    column;
    filename;
    constructor(message, line = 1, column = 1, filename = "") {
      super(message);
      this.name = "MagicError";
      this.line = line;
      this.column = column;
      this.filename = filename;
    }
    /** `file:line:column message`, ready for a terminal. */
    format() {
      const where = this.filename ? `${this.filename}:${this.line}:${this.column}` : `${this.line}:${this.column}`;
      return `${where} ${this.message}`;
    }
  };

  // dist/lexer.js
  var KEYWORDS = /* @__PURE__ */ new Set([
    "import",
    "from",
    "class",
    "fn",
    "end",
    "if",
    "then",
    "else",
    "elseif",
    "for",
    "while",
    "repeat",
    "until",
    "return",
    "break",
    "continue",
    "let",
    "print",
    "and",
    "or",
    "not",
    "true",
    "false",
    "nil",
    "new",
    "self",
    "super"
  ]);
  var Lexer = class {
    source;
    filename;
    i = 0;
    line = 1;
    column = 1;
    atLineStart = true;
    constructor(source, filename = "") {
      this.source = source.charCodeAt(0) === 65279 ? source.slice(1) : source;
      this.filename = filename;
    }
    tokenize() {
      const tokens = [];
      while (!this.done()) {
        this.skipSpaces();
        if (this.done())
          break;
        if (this.atLineStart && this.startsRemark()) {
          this.skipRemark();
          continue;
        }
        if (this.match("-", "-")) {
          this.skipToLineEnd();
          continue;
        }
        const token = this.one();
        if (!token)
          continue;
        tokens.push(token);
        this.atLineStart = token.kind === "newline";
      }
      tokens.push({ kind: "eof", value: "", line: this.line, column: this.column });
      return tokens;
    }
    one() {
      const line = this.line;
      const column = this.column;
      const ch = this.code();
      if (ch === 10 || ch === 13) {
        this.newline();
        return { kind: "newline", value: "\n", line, column };
      }
      if (ch === 34 || ch === 39)
        return this.string(line, column);
      if (this.isDigit(ch) || ch === 46 && this.isDigit(this.codeAt(1)))
        return this.number(line, column);
      if (this.isIdentStart(ch))
        return this.ident(line, column);
      const op = this.operator();
      if (op)
        return { kind: "op", value: op, line, column };
      throw this.fail(line, column, `unexpected character ${JSON.stringify(this.char())}`);
    }
    string(line, column) {
      const quote = this.char();
      this.bump();
      let value = "";
      while (!this.done()) {
        const ch = this.char();
        if (ch === quote) {
          this.bump();
          return { kind: "string", value, line, column };
        }
        if (ch === "\n" || ch === "\r") {
          throw this.fail(this.line, this.column, "a string has to end on the same line");
        }
        if (ch === "\\") {
          value += this.escape(line, column);
          continue;
        }
        value += this.bump();
      }
      throw this.fail(line, column, "this string never ends");
    }
    escape(line, column) {
      this.bump();
      if (this.done())
        throw this.fail(line, column, "this string never ends");
      const ch = this.bump();
      switch (ch) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "	";
        case "0":
          return "\0";
        case "\\":
        case "'":
        case '"':
          return ch;
        case "u":
          return this.unicode(line, column);
        default:
          throw this.fail(this.line, this.column, `unknown escape \\${ch}`);
      }
    }
    unicode(line, column) {
      if (this.char() === "{") {
        this.bump();
        let hex2 = "";
        while (this.isHex(this.code()) && hex2.length < 6)
          hex2 += this.bump();
        if (this.char() !== "}" || hex2.length === 0) {
          throw this.fail(line, column, "a \\u{...} escape needs hex digits and a closing brace");
        }
        this.bump();
        const code = Number.parseInt(hex2, 16);
        if (code > 1114111)
          throw this.fail(line, column, "that code point is too big");
        return String.fromCodePoint(code);
      }
      let hex = "";
      for (let n = 0; n < 4; n += 1) {
        if (!this.isHex(this.code()))
          throw this.fail(line, column, "a \\u escape needs four hex digits");
        hex += this.bump();
      }
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }
    number(line, column) {
      const start = this.i;
      if (this.char() === ".")
        this.bump();
      while (this.isDigit(this.code()))
        this.bump();
      if (this.char() === "." && this.isDigit(this.codeAt(1))) {
        this.bump();
        while (this.isDigit(this.code()))
          this.bump();
      }
      if (this.char() === "e" || this.char() === "E") {
        const mark = this.i;
        const markColumn = this.column;
        this.bump();
        if (this.char() === "+" || this.char() === "-")
          this.bump();
        if (!this.isDigit(this.code())) {
          this.i = mark;
          this.column = markColumn;
        } else {
          while (this.isDigit(this.code()))
            this.bump();
        }
      }
      const raw = this.source.slice(start, this.i);
      if (/^0\d/.test(raw)) {
        throw this.fail(line, column, `write ${Number(raw)} instead of ${raw}`);
      }
      return { kind: "number", value: raw, line, column };
    }
    ident(line, column) {
      let value = "";
      while (this.isIdentPart(this.code()))
        value += this.bump();
      const word = value.toLowerCase();
      if (KEYWORDS.has(word))
        return { kind: "keyword", value: word, line, column };
      return { kind: "ident", value, line, column };
    }
    operator() {
      const two = this.source.slice(this.i, this.i + 2);
      const pairs = ["==", "!=", "<>", "<=", ">=", "+=", "-=", "*=", "/=", ".."];
      if (pairs.includes(two)) {
        this.bump();
        this.bump();
        return two;
      }
      const one = this.char();
      if ("+-*/%^=<>()[]{},.:;&|#".includes(one)) {
        this.bump();
        return one;
      }
      return null;
    }
    startsRemark() {
      if (this.code() !== 82 && this.code() !== 114)
        return false;
      const rest = this.source.slice(this.i, this.i + 3).toLowerCase();
      if (rest !== "rem")
        return false;
      const after = this.codeAt(3);
      return !this.isIdentPart(after);
    }
    skipRemark() {
      this.skipToLineEnd();
      if (!this.done())
        this.newline();
      this.atLineStart = true;
    }
    skipToLineEnd() {
      while (!this.done() && this.code() !== 10 && this.code() !== 13)
        this.bump();
    }
    skipSpaces() {
      while (!this.done()) {
        const ch = this.code();
        if (ch === 32 || ch === 9 || ch === 12 || ch === 11) {
          this.bump();
          continue;
        }
        break;
      }
    }
    newline() {
      if (this.code() === 13 && this.codeAt(1) === 10)
        this.i += 2;
      else
        this.i += 1;
      this.line += 1;
      this.column = 1;
    }
    match(a, b) {
      return this.char() === a && this.source[this.i + a.length] === b;
    }
    bump() {
      const cp = this.source.codePointAt(this.i) ?? 0;
      const size = cp > 65535 ? 2 : 1;
      const ch = this.source.slice(this.i, this.i + size);
      this.i += size;
      this.column += 1;
      return ch;
    }
    char() {
      return this.source[this.i] ?? "";
    }
    code() {
      return this.source.codePointAt(this.i) ?? 0;
    }
    codeAt(offset) {
      return this.source.codePointAt(this.i + offset) ?? 0;
    }
    done() {
      return this.i >= this.source.length;
    }
    isDigit(code) {
      return code >= 48 && code <= 57;
    }
    isHex(code) {
      return this.isDigit(code) || code >= 65 && code <= 70 || code >= 97 && code <= 102;
    }
    isIdentStart(code) {
      return code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
    }
    isIdentPart(code) {
      return this.isIdentStart(code) || this.isDigit(code);
    }
    fail(line, column, message) {
      return new MagicError(message, line, column, this.filename);
    }
  };

  // dist/parser.js
  var JS_RESERVED = /* @__PURE__ */ new Set([
    "await",
    "arguments",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "eval",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "undefined",
    "var",
    "void",
    "while",
    "with",
    "yield"
  ]);
  var ASSIGN = {
    "=": "=",
    "+=": "+=",
    "-=": "-=",
    "*=": "*=",
    "/=": "/="
  };
  var Parser = class {
    tokens = [];
    i = 0;
    filename;
    constructor(filename = "") {
      this.filename = filename;
    }
    parse(source) {
      this.tokens = new Lexer(source, this.filename).tokenize();
      this.i = 0;
      const body = this.statements(/* @__PURE__ */ new Set(["eof"]));
      return { kind: "program", body, line: 1, column: 1, filename: this.filename };
    }
    statements(stop) {
      const body = [];
      for (; ; ) {
        this.skipNl();
        const token = this.peek();
        if (token.kind === "eof") {
          if (!stop.has("eof"))
            this.fail(token, `expected ${this.stopText(stop)}`);
          break;
        }
        if (token.kind === "keyword" && stop.has(token.value))
          break;
        body.push(this.statement());
        this.finish(stop);
      }
      return body;
    }
    statement() {
      const token = this.peek();
      if (token.kind === "keyword") {
        switch (token.value) {
          case "import":
            return this.importStmt();
          case "fn":
            return this.fnStmt();
          case "class":
            return this.classStmt();
          case "if":
            return this.ifStmt();
          case "while":
            return this.whileStmt();
          case "for":
            return this.forStmt();
          case "repeat":
            return this.repeatStmt();
          case "return":
            return this.returnStmt();
          case "break":
            this.next();
            return { kind: "break", ...this.at(token) };
          case "continue":
            this.next();
            return { kind: "continue", ...this.at(token) };
          case "let":
            return this.letStmt();
          case "print":
            return this.printStmt();
          case "end":
          case "else":
          case "elseif":
          case "until":
          case "then":
          case "from":
            this.fail(token, `unexpected ${token.value}`);
            break;
          default:
            break;
        }
      }
      return this.assignOrCall();
    }
    importStmt() {
      const start = this.next();
      if (this.peek().kind === "string") {
        const specifier2 = this.next().value;
        if (this.eatWord("as")) {
          const alias = this.expectIdent();
          return { kind: "import", form: "namespace", specifier: specifier2, alias, names: [], ...this.at(start) };
        }
        return { kind: "import", form: "side", specifier: specifier2, alias: null, names: [], ...this.at(start) };
      }
      const names = [];
      do {
        const imported = this.expectIdent();
        const local = this.eatWord("as") ? this.expectIdent() : imported;
        names.push({ imported, local });
      } while (this.eatOp(","));
      this.expectKeyword("from");
      const specifier = this.expectKind("string", "expected a module name in quotes").value;
      return { kind: "import", form: "named", specifier, alias: null, names, ...this.at(start) };
    }
    fnStmt() {
      const start = this.next();
      if (this.peek().kind !== "ident") {
        this.fail(this.peek(), "this function needs a name. Use fn name(), or fn() inside an expression");
      }
      const name = this.expectIdent();
      const params = this.params();
      const body = this.statements(/* @__PURE__ */ new Set(["end"]));
      this.expectKeyword("end");
      return { kind: "fn", name, params, body, ...this.at(start) };
    }
    classStmt() {
      const start = this.next();
      const name = this.expectIdent();
      const parent = this.eatWord("is") ? this.expectIdent() : null;
      const fields = [];
      const methods = [];
      const used = /* @__PURE__ */ new Set();
      for (; ; ) {
        this.skipNl();
        const token = this.peek();
        if (token.kind === "eof")
          this.fail(token, `expected end to close class ${name}`);
        if (token.kind === "keyword" && token.value === "end")
          break;
        if (token.kind === "keyword" && token.value === "fn") {
          const method = this.method();
          if (used.has(method.name))
            this.fail(method, `${method.name} is already in class ${name}`);
          used.add(method.name);
          methods.push(method);
          continue;
        }
        if (token.kind === "keyword" && token.value === "let")
          this.next();
        if (this.peek().kind !== "ident")
          this.fail(this.peek(), "a class holds fields and fn methods");
        const fieldName = this.expectIdent();
        if (fieldName === "new")
          this.fail(token, "new is the constructor. Write fn new()");
        if (used.has(fieldName))
          this.fail(token, `${fieldName} is already in class ${name}`);
        used.add(fieldName);
        if (!this.eatOp("="))
          this.fail(this.peek(), `field ${fieldName} needs = and a value`);
        this.skipNl();
        const init = this.expression();
        fields.push({ name: fieldName, init, ...this.at(token) });
        this.finish(/* @__PURE__ */ new Set(["end"]));
      }
      this.expectKeyword("end");
      return { kind: "class", name, parent, fields, methods, ...this.at(start) };
    }
    method() {
      const start = this.next();
      const name = this.methodName();
      const params = this.params();
      const body = this.statements(/* @__PURE__ */ new Set(["end"]));
      this.expectKeyword("end");
      return { name, params, body, ...this.at(start) };
    }
    ifStmt() {
      const start = this.next();
      const arms = [];
      const first = this.condition();
      this.eatWord("then");
      arms.push({ test: first, body: this.statements(/* @__PURE__ */ new Set(["end", "else", "elseif"])), ...this.at(start) });
      for (; ; ) {
        if (this.peek().kind === "keyword" && this.peek().value === "elseif") {
          const mark = this.next();
          const test = this.condition();
          this.eatWord("then");
          arms.push({ test, body: this.statements(/* @__PURE__ */ new Set(["end", "else", "elseif"])), ...this.at(mark) });
          continue;
        }
        if (this.peek().kind === "keyword" && this.peek().value === "else") {
          const elseToken = this.peek();
          const next = this.peek(1);
          if (next.kind === "keyword" && next.value === "if" && next.line === elseToken.line) {
            this.next();
            const mark = this.next();
            const test = this.condition();
            this.eatWord("then");
            arms.push({ test, body: this.statements(/* @__PURE__ */ new Set(["end", "else", "elseif"])), ...this.at(mark) });
            continue;
          }
          this.next();
          const elseBody = this.statements(/* @__PURE__ */ new Set(["end"]));
          this.expectKeyword("end");
          return { kind: "if", arms, elseBody, ...this.at(start) };
        }
        break;
      }
      this.expectKeyword("end");
      return { kind: "if", arms, elseBody: null, ...this.at(start) };
    }
    whileStmt() {
      const start = this.next();
      const test = this.condition();
      this.eatWord("do");
      const body = this.statements(/* @__PURE__ */ new Set(["end"]));
      this.expectKeyword("end");
      return { kind: "while", test, body, ...this.at(start) };
    }
    forStmt() {
      const start = this.next();
      const name = this.expectIdent();
      if (this.eatOp("=")) {
        const from = this.expression();
        if (!this.eatWord("to"))
          this.fail(this.peek(), "for i = start to stop");
        const to = this.expression();
        const step = this.eatWord("step") ? this.expression() : null;
        this.eatWord("do");
        const body = this.statements(/* @__PURE__ */ new Set(["end"]));
        this.expectKeyword("end");
        return { kind: "for", name, from, to, step, iter: null, body, ...this.at(start) };
      }
      if (this.eatWord("in")) {
        const iter = this.expression();
        this.eatWord("do");
        const body = this.statements(/* @__PURE__ */ new Set(["end"]));
        this.expectKeyword("end");
        return { kind: "for", name, from: null, to: null, step: null, iter, body, ...this.at(start) };
      }
      this.fail(this.peek(), "for i = start to stop, or for item in list");
    }
    repeatStmt() {
      const start = this.next();
      const body = this.statements(/* @__PURE__ */ new Set(["until"]));
      this.expectKeyword("until");
      const test = this.condition();
      return { kind: "repeat", body, test, ...this.at(start) };
    }
    returnStmt() {
      const start = this.next();
      if (this.closes())
        return { kind: "return", value: null, ...this.at(start) };
      return { kind: "return", value: this.expression(), ...this.at(start) };
    }
    letStmt() {
      const start = this.next();
      const name = this.expectIdent();
      if (!this.eatOp("="))
        return { kind: "let", name, init: null, ...this.at(start) };
      this.skipNl();
      return { kind: "let", name, init: this.expression(), ...this.at(start) };
    }
    printStmt() {
      const start = this.next();
      if (this.closes())
        return { kind: "print", args: [], ...this.at(start) };
      const args = [this.expression()];
      while (this.eatOp(",")) {
        this.skipNl();
        args.push(this.expression());
      }
      return { kind: "print", args, ...this.at(start) };
    }
    assignOrCall() {
      const start = this.peek();
      const expr = this.expression();
      const op = this.peek();
      if (op.kind === "op" && ASSIGN[op.value]) {
        this.next();
        if (!this.isTarget(expr))
          this.fail(start, "this cannot be assigned to");
        this.skipNl();
        const value = this.expression();
        return { kind: "assign", target: expr, op: ASSIGN[op.value], value, ...this.at(start) };
      }
      if (expr.kind !== "call" && expr.kind !== "super") {
        this.fail(start, "this value is unused. Call a function, or assign with =");
      }
      return { kind: "expr", expr, ...this.at(start) };
    }
    condition() {
      const expr = this.expression();
      const next = this.peek();
      if (next.kind === "op" && next.value === "=") {
        this.fail(next, "use == to compare. = assigns a value");
      }
      return expr;
    }
    expression(min = 0) {
      let left = this.unary();
      for (; ; ) {
        const op = this.binaryOp(this.peek());
        if (!op || op.prec < min)
          break;
        this.next();
        this.skipNl();
        const nextMin = op.right ? op.prec : op.prec + 1;
        const right = this.expression(nextMin);
        left = { kind: "binary", op: op.op, left, right, line: left.line, column: left.column };
      }
      return left;
    }
    unary() {
      const token = this.peek();
      if (token.kind === "keyword" && token.value === "not") {
        this.next();
        this.skipNl();
        return { kind: "unary", op: "not", expr: this.expression(3), ...this.at(token) };
      }
      if (token.kind === "keyword" && token.value === "new")
        return this.newExpr();
      if (token.kind === "op" && token.value === "-") {
        this.next();
        this.skipNl();
        return { kind: "unary", op: "-", expr: this.expression(8), ...this.at(token) };
      }
      if (token.kind === "op" && token.value === "#") {
        this.next();
        this.skipNl();
        return { kind: "unary", op: "#", expr: this.expression(8), ...this.at(token) };
      }
      return this.postfix();
    }
    newExpr() {
      const start = this.next();
      let callee = this.primary();
      callee = this.memberChain(callee);
      if (!this.eatOp("("))
        this.fail(this.peek(), "new needs a call, like new Engine({})");
      const args = this.argList();
      this.expectOp(")");
      let expr = { kind: "new", callee, args, ...this.at(start) };
      expr = this.memberChain(expr);
      while (this.peek().kind === "op" && this.peek().value === "(") {
        expr = this.callAfter(expr);
      }
      return expr;
    }
    postfix() {
      let expr = this.primary();
      for (; ; ) {
        if (this.peek().kind === "op" && this.peek().value === "(") {
          expr = this.callAfter(expr);
          continue;
        }
        if (this.peek().kind === "string" && (expr.kind === "name" || expr.kind === "member")) {
          const text = this.next();
          expr = {
            kind: "call",
            callee: expr,
            args: [{ kind: "string", value: text.value, ...this.at(text) }],
            ...this.at(text)
          };
          continue;
        }
        const chained = this.oneMember(expr);
        if (!chained)
          break;
        expr = chained;
      }
      return expr;
    }
    memberChain(expr) {
      let current = expr;
      for (; ; ) {
        const next = this.oneMember(current);
        if (!next)
          return current;
        current = next;
      }
    }
    oneMember(expr) {
      if (this.eatOp(".")) {
        const name = this.expectMemberName();
        return { kind: "member", object: expr, name, line: expr.line, column: expr.column };
      }
      if (this.eatOp("[")) {
        this.skipNl();
        const index = this.expression();
        this.skipNl();
        this.expectOp("]");
        return { kind: "index", object: expr, index, line: expr.line, column: expr.column };
      }
      return null;
    }
    callAfter(expr) {
      const mark = this.next();
      const args = this.argList();
      this.expectOp(")");
      return { kind: "call", callee: expr, args, ...this.at(mark) };
    }
    primary() {
      const token = this.peek();
      if (token.kind === "number") {
        this.next();
        const value = Number(token.value);
        if (!Number.isFinite(value))
          this.fail(token, "that number is not usable");
        return { kind: "number", raw: token.value, value, ...this.at(token) };
      }
      if (token.kind === "string") {
        this.next();
        return { kind: "string", value: token.value, ...this.at(token) };
      }
      if (token.kind === "keyword" && token.value === "true") {
        this.next();
        return { kind: "bool", value: true, ...this.at(token) };
      }
      if (token.kind === "keyword" && token.value === "false") {
        this.next();
        return { kind: "bool", value: false, ...this.at(token) };
      }
      if (token.kind === "keyword" && token.value === "nil") {
        this.next();
        return { kind: "nil", ...this.at(token) };
      }
      if (token.kind === "keyword" && token.value === "self") {
        this.next();
        return { kind: "self", ...this.at(token) };
      }
      if (token.kind === "keyword" && token.value === "super")
        return this.superExpr();
      if (token.kind === "keyword" && token.value === "fn")
        return this.fnExpr();
      if (token.kind === "ident") {
        this.next();
        return { kind: "name", name: token.value, ...this.at(token) };
      }
      if (token.kind === "op" && token.value === "(")
        return this.group();
      if (token.kind === "op" && token.value === "[")
        return this.list();
      if (token.kind === "op" && token.value === "{")
        return this.record();
      this.fail(token, "expected a value");
    }
    superExpr() {
      const start = this.next();
      if (this.eatOp(".")) {
        const method = this.expectMemberName();
        if (!this.eatOp("("))
          this.fail(this.peek(), `super.${method} needs ()`);
        const args2 = this.argList();
        this.expectOp(")");
        return { kind: "super", method, args: args2, ...this.at(start) };
      }
      if (!this.eatOp("("))
        this.fail(this.peek(), "super needs (), or super.method()");
      const args = this.argList();
      this.expectOp(")");
      return { kind: "super", method: null, args, ...this.at(start) };
    }
    fnExpr() {
      const start = this.next();
      if (this.peek().kind === "ident") {
        this.fail(this.peek(), "a named fn is a statement. Here, write fn(x)");
      }
      const params = this.params();
      const body = this.statements(/* @__PURE__ */ new Set(["end"]));
      this.expectKeyword("end");
      return { kind: "fn", params, body, ...this.at(start) };
    }
    group() {
      this.next();
      this.skipNl();
      const expr = this.expression();
      this.skipNl();
      this.expectOp(")");
      return expr;
    }
    list() {
      const start = this.next();
      const items = [];
      this.skipNl();
      if (!this.eatOp("]")) {
        for (; ; ) {
          items.push(this.expression());
          this.skipNl();
          if (!this.eatOp(","))
            break;
          this.skipNl();
          if (this.peek().kind === "op" && this.peek().value === "]")
            break;
        }
        this.expectOp("]");
      }
      return { kind: "list", items, ...this.at(start) };
    }
    record() {
      const start = this.next();
      const fields = [];
      this.skipNl();
      if (!this.eatOp("}")) {
        for (; ; ) {
          const key = this.peek();
          let name = "";
          if (key.kind === "ident")
            name = this.expectMemberName();
          else if (key.kind === "string") {
            this.next();
            name = key.value;
          } else
            this.fail(key, "a record field needs a name");
          if (!this.eatOp(":"))
            this.fail(this.peek(), `field ${name} needs : and a value`);
          this.skipNl();
          fields.push({ name, value: this.expression() });
          this.skipNl();
          if (!this.eatOp(","))
            break;
          this.skipNl();
          if (this.peek().kind === "op" && this.peek().value === "}")
            break;
        }
        this.expectOp("}");
      }
      return { kind: "record", fields, ...this.at(start) };
    }
    params() {
      this.expectOp("(");
      const names = [];
      this.skipNl();
      if (this.eatOp(")"))
        return names;
      for (; ; ) {
        const mark = this.peek();
        const name = this.expectIdent();
        if (names.includes(name))
          this.fail(mark, `${name} is already a parameter`);
        names.push(name);
        this.skipNl();
        if (!this.eatOp(","))
          break;
        this.skipNl();
        if (this.peek().kind === "op" && this.peek().value === ")")
          break;
      }
      this.expectOp(")");
      return names;
    }
    argList() {
      const args = [];
      this.skipNl();
      if (this.peek().kind === "op" && this.peek().value === ")")
        return args;
      for (; ; ) {
        args.push(this.expression());
        this.skipNl();
        if (!this.eatOp(","))
          break;
        this.skipNl();
        if (this.peek().kind === "op" && this.peek().value === ")")
          break;
      }
      return args;
    }
    binaryOp(token) {
      if (token.kind === "keyword" && token.value === "or")
        return { op: "or", prec: 1, right: false };
      if (token.kind === "keyword" && token.value === "and")
        return { op: "and", prec: 2, right: false };
      if (token.kind === "ident" && token.value.toLowerCase() === "mod")
        return { op: "%", prec: 6, right: false };
      if (token.kind !== "op")
        return null;
      switch (token.value) {
        case "==":
        case "!=":
        case "<>":
        case "<":
        case ">":
        case "<=":
        case ">=":
          return { op: token.value, prec: 3, right: false };
        case "..":
        case "&":
          return { op: "&", prec: 4, right: false };
        case "+":
        case "-":
          return { op: token.value, prec: 5, right: false };
        case "*":
        case "/":
        case "%":
          return { op: token.value, prec: 6, right: false };
        case "^":
          return { op: "^", prec: 8, right: true };
        default:
          return null;
      }
    }
    isTarget(expr) {
      return expr.kind === "name" || expr.kind === "member" || expr.kind === "index";
    }
    closes() {
      const token = this.peek();
      if (token.kind === "eof" || token.kind === "newline")
        return true;
      if (token.kind === "op" && (token.value === ":" || token.value === ";"))
        return true;
      if (token.kind === "keyword") {
        return token.value === "end" || token.value === "else" || token.value === "elseif" || token.value === "until";
      }
      return false;
    }
    finish(stop) {
      const token = this.peek();
      if (token.kind === "eof")
        return;
      if (token.kind === "newline") {
        this.next();
        return;
      }
      if (token.kind === "op" && (token.value === ":" || token.value === ";")) {
        this.next();
        return;
      }
      if (token.kind === "keyword" && stop.has(token.value))
        return;
      this.fail(token, "expected a new line or : before this");
    }
    /** A property can use a JavaScript word. A variable cannot. */
    expectMemberName() {
      const token = this.peek();
      if (token.kind !== "ident")
        this.fail(token, "expected a name");
      this.next();
      if (token.value.startsWith("__magic"))
        this.fail(token, "names cannot start with __magic");
      return token.value;
    }
    /** `fn new` is the constructor. `new` stays a keyword everywhere else. */
    methodName() {
      const token = this.peek();
      if (token.kind === "keyword" && token.value === "new") {
        this.next();
        return "new";
      }
      return this.expectIdent();
    }
    expectIdent() {
      const token = this.peek();
      if (token.kind === "keyword")
        this.fail(token, `${token.value} is a Magic word. Pick another name`);
      this.expectKind("ident", "expected a name");
      if (token.value.startsWith("__magic")) {
        this.fail(token, "names cannot start with __magic");
      }
      if (JS_RESERVED.has(token.value)) {
        this.fail(token, `${token.value} is reserved. Pick another name`);
      }
      return token.value;
    }
    expectKeyword(value) {
      const token = this.peek();
      if (token.kind === "keyword" && token.value === value)
        return this.next();
      this.fail(token, `expected ${value}`);
    }
    expectOp(value) {
      const token = this.peek();
      if (token.kind === "op" && token.value === value)
        return this.next();
      this.fail(token, `expected ${value}`);
    }
    expectKind(kind, message) {
      const token = this.peek();
      if (token.kind !== kind)
        this.fail(token, message);
      return this.next();
    }
    eatOp(value) {
      if (this.peek().kind === "op" && this.peek().value === value) {
        this.next();
        return true;
      }
      return false;
    }
    eatWord(word) {
      const token = this.peek();
      const wordLike = token.kind === "ident" || token.kind === "keyword";
      if (wordLike && token.value.toLowerCase() === word) {
        this.next();
        return true;
      }
      return false;
    }
    skipNl() {
      while (this.peek().kind === "newline")
        this.next();
    }
    peek(offset = 0) {
      return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
    }
    next() {
      const token = this.peek();
      if (token.kind !== "eof")
        this.i += 1;
      return token;
    }
    at(token) {
      return { line: token.line, column: token.column };
    }
    stopText(stop) {
      const words = [...stop].filter((word) => word !== "eof");
      return words.length > 0 ? words.join(" or ") : "end";
    }
    fail(token, message) {
      throw new MagicError(message, token.line, token.column, this.filename);
    }
  };

  // dist/std.js
  var PRELUDE_SOURCE = `function __magic_text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'function') return value.name ? value.name : 'fn';
  return String(value);
}

function __magic_cat(a, b) {
  return __magic_text(a) + __magic_text(b);
}

function __magic_len(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return Array.from(value).length;
  if (typeof value === 'function') return value.length;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function __magic_iter(value) {
  if (typeof value === 'string') return Array.from(value);
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.keys(value);
  return [];
}

function __magic_inits(ctor, self) {
  const chain = [];
  let current = ctor;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = current.__magicParent || null;
  }
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const init = chain[i].__magicInit;
    if (typeof init === 'function') init.call(self);
  }
}

function __magic_super(parent, self, args) {
  const fn = parent && parent.prototype && parent.prototype.__magicNew;
  if (typeof fn === 'function') return fn.apply(self, args);
  return null;
}

function __magic_print(...args) {
  if (args.length === 0) {
    console.log('');
    return;
  }
  console.log(args.map(__magic_text).join('\\t'));
}

function __magic_num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function __magic_int(value) {
  const n = __magic_num(value);
  return n === null ? null : Math.trunc(n);
}

function __magic_type(value) {
  if (value === null || value === undefined) return 'nil';
  if (Array.isArray(value)) return 'list';
  const kind = typeof value;
  if (kind === 'number') return 'number';
  if (kind === 'string') return 'string';
  if (kind === 'boolean') return 'bool';
  if (kind === 'function') return 'fn';
  if (kind === 'object') {
    const proto = Object.getPrototypeOf(value);
    const ctor = proto && proto.constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name !== '' && ctor.name !== 'Object') {
      return ctor.name;
    }
    return 'record';
  }
  return kind;
}

function __magic_keys(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.keys(value);
  return [];
}

function __magic_values(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function __magic_push(list, item) {
  if (!Array.isArray(list)) throw new Error('push expects a list');
  list.push(item);
  return item;
}

function __magic_pop(list) {
  if (!Array.isArray(list)) throw new Error('pop expects a list');
  const item = list.pop();
  return item === undefined ? null : item;
}

function __magic_time() {
  return Date.now();
}
`;
  var PRELUDE_EXPORTS = [
    "__magic_print",
    "__magic_len",
    "__magic_text",
    "__magic_num",
    "__magic_int",
    "__magic_type",
    "__magic_keys",
    "__magic_values",
    "__magic_push",
    "__magic_pop",
    "__magic_time",
    "__magic_cat",
    "__magic_iter",
    "__magic_inits",
    "__magic_super"
  ];
  var BUILTIN_JS = {
    print: "__magic_print",
    len: "__magic_len",
    str: "__magic_text",
    num: "__magic_num",
    int: "__magic_int",
    type: "__magic_type",
    keys: "__magic_keys",
    values: "__magic_values",
    push: "__magic_push",
    pop: "__magic_pop",
    time: "__magic_time"
  };
  var BUILTIN_NAMES = [
    "print",
    "len",
    "str",
    "num",
    "int",
    "type",
    "keys",
    "values",
    "push",
    "pop",
    "time"
  ];
  function preludeInlineSource() {
    return PRELUDE_SOURCE;
  }

  // dist/compiler.js
  var Compiler = class {
    w = new Writer();
    filename = "";
    esm = false;
    bindings = [];
    scope = { kind: "module", names: /* @__PURE__ */ new Map(), parent: null };
    scopes = /* @__PURE__ */ new WeakMap();
    root = builtinScope();
    selfExpr = null;
    superName = null;
    allowSuper = false;
    loop = 0;
    fnDepth = 0;
    temps = 0;
    readyClasses = /* @__PURE__ */ new Set();
    compile(source, options = {}) {
      const filename = options.filename ?? "";
      const program = new Parser(filename).parse(source);
      return this.compileProgram(program, options);
    }
    compileProgram(program, options = {}) {
      this.reset(program.filename || options.filename || "");
      const target = options.target ?? "module";
      this.analyze(program);
      if (target === "script")
        return this.compileScript(program);
      return this.compileModule(program, options);
    }
    /** Statements for one file inside a bundle. The caller wraps them in a function. */
    emitBody(program, options) {
      this.reset(program.filename || options.filename || "");
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
      const prelude = options.prelude ?? "./magic-std.js";
      this.header(program.filename);
      const imports = this.emitModuleImports(program, resolve, prelude);
      this.emitMain(program);
      return { code: this.w.text(), exports: this.exportNames(), imports };
    }
    compileScript(program) {
      this.esm = false;
      const imports = this.scriptBindings(program);
      this.header(program.filename);
      this.w.line("globalThis.__magic_module = (() => {");
      this.w.push();
      for (const line of preludeInlineSource().split("\n"))
        this.w.line(line);
      this.emitMain(program);
      this.w.pop();
      this.w.line("})();");
      return { code: this.w.text(), exports: this.exportNames(), imports };
    }
    header(filename) {
      const from = filename ? ` from ${filename}` : "";
      this.w.line(`// Compiled${from} by emoji-engine-magic.`);
    }
    emitModuleImports(program, resolve, prelude) {
      this.w.line(`import { ${PRELUDE_EXPORTS.join(", ")} } from ${JSON.stringify(prelude)};`);
      const compiled = [];
      for (const stmt of importsOf(program)) {
        const resolved = resolve(stmt.specifier);
        const engine = engineKey(stmt.specifier);
        const kind = engine ? "engine" : isMagicSpecifier(stmt.specifier) ? "magic" : "js";
        compiled.push({
          specifier: stmt.specifier,
          resolved,
          kind,
          engine,
          form: stmt.form,
          alias: stmt.alias,
          names: stmt.names
        });
        const from = JSON.stringify(resolved);
        if (stmt.form === "side") {
          this.w.line(`import ${from};`);
        } else if (stmt.form === "namespace" && stmt.alias) {
          this.w.line(`import * as ${stmt.alias} from ${from};`);
        } else {
          const names = stmt.names.map((name) => name.imported === name.local ? name.imported : `${name.imported} as ${name.local}`).join(", ");
          this.w.line(`import { ${names} } from ${from};`);
        }
      }
      return compiled;
    }
    scriptBindings(program) {
      const compiled = [];
      for (const stmt of importsOf(program)) {
        if (isMagicSpecifier(stmt.specifier)) {
          this.oops(stmt, "this script imports another Magic file. Use magic run, or magic compile -o");
        }
        const engine = engineKey(stmt.specifier);
        if (!engine)
          this.oops(stmt, `${stmt.specifier} is not 2d, 3d, or ui`);
        const info = ENGINES[engine];
        const ns = `globalThis.${info.global}`;
        compiled.push({
          specifier: stmt.specifier,
          resolved: ns,
          kind: "engine",
          engine,
          form: stmt.form,
          alias: stmt.alias,
          names: stmt.names
        });
        if (stmt.form === "namespace" && stmt.alias)
          this.bindings.push({ local: stmt.alias, expr: ns });
        if (stmt.form === "named") {
          for (const name of stmt.names)
            this.bindings.push({ local: name.local, expr: `${ns}.${name.imported}` });
        }
      }
      return compiled;
    }
    checkBindings(program) {
      const have = new Set(this.bindings.map((binding) => binding.local));
      for (const stmt of importsOf(program)) {
        const locals = stmt.form === "namespace" && stmt.alias ? [stmt.alias] : stmt.names.map((name) => name.local);
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
        if (stmt.kind === "import")
          continue;
        this.emitStmt(stmt);
      }
      if (!this.esm)
        this.w.line(`return { ${this.exportNames().join(", ")} };`);
    }
    emitHoist(scope) {
      for (const [name, kind] of scope.names) {
        if (kind !== "let")
          continue;
        if (this.esm && scope.kind === "module")
          this.w.line(`export let ${name};`);
        else
          this.w.line(`let ${name};`);
      }
    }
    exportNames() {
      const scope = this.scopes.get(this.programKey) ?? this.scope;
      const names = [];
      for (const [name, kind] of scope.names) {
        if (kind === "let" || kind === "fn" || kind === "class")
          names.push(name);
      }
      return names;
    }
    programKey = {};
    emitStmt(stmt) {
      switch (stmt.kind) {
        case "import":
          return;
        case "fn":
          this.emitFn(stmt);
          return;
        case "class":
          this.emitClass(stmt);
          return;
        case "let":
          if (stmt.init)
            this.w.line(`${stmt.name} = ${this.expr(stmt.init)};`);
          return;
        case "assign":
          this.emitAssign(stmt);
          return;
        case "print":
          this.w.line(`__magic_print(${stmt.args.map((arg) => this.expr(arg)).join(", ")});`);
          return;
        case "expr":
          this.w.line(`${this.expr(stmt.expr)};`);
          return;
        case "return":
          if (this.fnDepth <= 0)
            this.oops(stmt, "return belongs inside a fn");
          this.w.line(stmt.value ? `return ${this.expr(stmt.value)};` : "return;");
          return;
        case "break":
          if (this.loop <= 0)
            this.oops(stmt, "break belongs inside a for, while, or repeat");
          this.w.line("break;");
          return;
        case "continue":
          if (this.loop <= 0)
            this.oops(stmt, "continue belongs inside a for, while, or repeat");
          this.w.line("continue;");
          return;
        case "if":
          this.emitIf(stmt);
          return;
        case "while":
          this.w.line(`while (${this.expr(stmt.test)}) {`);
          this.w.push();
          this.emitLoop(stmt.body);
          this.w.pop();
          this.w.line("}");
          return;
        case "repeat":
          this.w.line("do {");
          this.w.push();
          this.emitLoop(stmt.body);
          this.w.pop();
          this.w.line(`} while (!(${this.expr(stmt.test)}));`);
          return;
        case "for":
          this.emitFor(stmt);
          return;
        default:
          return;
      }
    }
    emitIf(stmt) {
      stmt.arms.forEach((arm, index) => {
        this.w.line(`${index === 0 ? "if" : "} else if"} (${this.expr(arm.test)}) {`);
        this.w.push();
        for (const inner of arm.body)
          this.emitStmt(inner);
        this.w.pop();
      });
      if (stmt.elseBody) {
        this.w.line("} else {");
        this.w.push();
        for (const inner of stmt.elseBody)
          this.emitStmt(inner);
        this.w.pop();
      }
      this.w.line("}");
    }
    emitFor(stmt) {
      if (stmt.iter) {
        const item = this.temp();
        this.w.line(`for (const ${item} of __magic_iter(${this.expr(stmt.iter)})) {`);
        this.w.push();
        this.w.line(`${stmt.name} = ${item};`);
        this.emitLoop(stmt.body);
        this.w.pop();
        this.w.line("}");
        return;
      }
      const to = this.temp();
      const step = this.temp();
      this.w.line("{");
      this.w.push();
      this.w.line(`const ${to} = ${this.expr(stmt.to)};`);
      this.w.line(`const ${step} = ${stmt.step ? this.expr(stmt.step) : "1"};`);
      this.w.line(`for (${stmt.name} = ${this.expr(stmt.from)}; ${step} >= 0 ? ${stmt.name} <= ${to} : ${stmt.name} >= ${to}; ${stmt.name} = ${stmt.name} + ${step}) {`);
      this.w.push();
      this.emitLoop(stmt.body);
      this.w.pop();
      this.w.line("}");
      this.w.pop();
      this.w.line("}");
    }
    emitLoop(body) {
      this.loop += 1;
      for (const stmt of body)
        this.emitStmt(stmt);
      this.loop -= 1;
    }
    emitAssign(stmt) {
      const math = stmt.op === "=" ? null : stmt.op[0];
      if (stmt.target.kind === "name") {
        const left = this.assignable(stmt.target.name, stmt);
        const right = this.expr(stmt.value);
        this.w.line(math ? `${left} = ${left} ${math} (${right});` : `${left} = ${right};`);
        return;
      }
      const object = this.temp();
      this.w.line("{");
      this.w.push();
      if (stmt.target.kind === "member") {
        this.w.line(`const ${object} = ${this.expr(stmt.target.object)};`);
        const slot = `${object}.${stmt.target.name}`;
        const right = this.expr(stmt.value);
        this.w.line(math ? `${slot} = ${slot} ${math} (${right});` : `${slot} = ${right};`);
      } else if (stmt.target.kind === "index") {
        const index = this.temp();
        this.w.line(`const ${object} = ${this.expr(stmt.target.object)};`);
        this.w.line(`const ${index} = ${this.expr(stmt.target.index)};`);
        const slot = `${object}[${index}]`;
        const right = this.expr(stmt.value);
        this.w.line(math ? `${slot} = ${slot} ${math} (${right});` : `${slot} = ${right};`);
      } else {
        this.oops(stmt, "this cannot be assigned to");
      }
      this.w.pop();
      this.w.line("}");
    }
    emitFn(stmt) {
      const scope = this.needScope(stmt, stmt.name);
      const exporting = this.esm && this.scope.kind === "module";
      const header = `${exporting ? "export " : ""}function ${stmt.name}(${stmt.params.join(", ")}) {`;
      this.emitFnBody(header, stmt.body, scope, {
        bindSelf: false,
        inheritSelf: true,
        allowSuper: this.allowSuper,
        superName: this.superName,
        selfExpr: this.selfExpr
      });
    }
    emitClass(stmt) {
      if (stmt.parent) {
        const found = this.scope.names.get(stmt.parent);
        if (found === "class" && !this.readyClasses.has(stmt.parent)) {
          this.oops(stmt, `write class ${stmt.parent} before class ${stmt.name}`);
        }
      }
      const parentJs = stmt.parent ? this.ref(stmt.parent) : null;
      const exporting = this.esm && this.scope.kind === "module";
      this.w.line(`${exporting ? "export " : ""}function ${stmt.name}(...__magic_args) {`);
      this.w.push();
      this.w.line(`if (!new.target) return Reflect.construct(${stmt.name}, __magic_args);`);
      this.w.line("__magic_inits(new.target, this);");
      this.w.line("const __magic_ctor = new.target.prototype.__magicNew;");
      this.w.line('if (typeof __magic_ctor === "function") __magic_ctor.apply(this, __magic_args);');
      this.w.line("return this;");
      this.w.pop();
      this.w.line("}");
      this.w.line(`${stmt.name}.__magicParent = ${parentJs ?? "null"};`);
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
      this.selfExpr = "__magic_self";
      this.allowSuper = false;
      this.superName = null;
      this.w.line("const __magic_self = this;");
      for (const field of stmt.fields) {
        this.w.line(`__magic_self.${field.name} = ${this.expr(field.init)};`);
      }
      this.restoreFlags(saved);
      this.w.pop();
      this.w.line("};");
    }
    emitMethod(className, method, parentJs) {
      const scope = this.needScope(method, method.name);
      const jsName = method.name === "new" ? "__magicNew" : method.name;
      const header = `${className}.prototype.${jsName} = function (${method.params.join(", ")}) {`;
      this.emitFnBody(header, method.body, scope, {
        bindSelf: true,
        inheritSelf: false,
        allowSuper: parentJs !== null,
        superName: parentJs,
        selfExpr: null
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
        this.selfExpr = "__magic_self";
        this.allowSuper = flags.allowSuper;
        this.superName = flags.superName;
      }
      this.w.line(header);
      this.w.push();
      if (flags.bindSelf)
        this.w.line("const __magic_self = this;");
      this.emitHoist(scope);
      for (const stmt of body)
        this.emitStmt(stmt);
      this.w.pop();
      this.w.line("}");
      this.scope = savedScope;
      this.loop = savedLoop;
      this.fnDepth = savedDepth;
      this.restoreFlags(saved);
    }
    emitAnon(expr) {
      const scope = this.needScope(expr, "fn");
      const sub = new Writer(this.w.indent);
      const savedWriter = this.w;
      this.w = sub;
      this.emitFnBody(`function (${expr.params.join(", ")}) {`, expr.body, scope, {
        bindSelf: false,
        inheritSelf: true,
        allowSuper: this.allowSuper,
        superName: this.superName,
        selfExpr: this.selfExpr
      });
      this.w = savedWriter;
      return `(${sub.text().trim()})`;
    }
    expr(expr) {
      switch (expr.kind) {
        case "number":
          return expr.raw;
        case "string":
          return JSON.stringify(expr.value);
        case "bool":
          return expr.value ? "true" : "false";
        case "nil":
          return "null";
        case "name":
          return this.ref(expr.name);
        case "self":
          return this.selfRef(expr);
        case "list":
          return `[${expr.items.map((item) => this.expr(item)).join(", ")}]`;
        case "record":
          return `({ ${expr.fields.map((field) => `${this.prop(field.name)}: ${this.expr(field.value)}`).join(", ")} })`;
        case "unary":
          if (expr.op === "not")
            return `!(${this.expr(expr.expr)})`;
          if (expr.op === "#")
            return `__magic_len(${this.expr(expr.expr)})`;
          return `-(${this.expr(expr.expr)})`;
        case "binary":
          return this.binary(expr);
        case "call":
          return `${this.callee(expr.callee)}(${expr.args.map((arg) => this.expr(arg)).join(", ")})`;
        case "member":
          return `${this.expr(expr.object)}.${expr.name}`;
        case "index":
          return `${this.expr(expr.object)}[${this.expr(expr.index)}]`;
        case "new":
          return `new ${this.callee(expr.callee)}(${expr.args.map((arg) => this.expr(arg)).join(", ")})`;
        case "fn":
          return this.emitAnon(expr);
        case "super":
          return this.superCall(expr);
        default:
          return "null";
      }
    }
    binary(expr) {
      const left = this.expr(expr.left);
      const right = this.expr(expr.right);
      if (expr.op === "&")
        return `__magic_cat(${left}, ${right})`;
      if (expr.op === "^")
        return `Math.pow(${left}, ${right})`;
      const op = expr.op === "and" ? "&&" : expr.op === "or" ? "||" : expr.op === "==" ? "===" : expr.op === "!=" || expr.op === "<>" ? "!==" : expr.op;
      return `(${left} ${op} ${right})`;
    }
    superCall(expr) {
      if (!this.allowSuper || !this.superName) {
        this.oops(expr, "super needs a parent. Write class Child is Parent");
      }
      if (expr.method === null) {
        const args2 = expr.args.map((arg) => this.expr(arg)).join(", ");
        return `__magic_super(${this.superName}, __magic_self, [${args2}])`;
      }
      const args = ["__magic_self", ...expr.args.map((arg) => this.expr(arg))].join(", ");
      return `${this.superName}.prototype.${expr.method}.call(${args})`;
    }
    prop(name) {
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
    }
    callee(expr) {
      if (expr.kind === "name")
        return this.ref(expr.name);
      if (expr.kind === "member")
        return `${this.expr(expr.object)}.${expr.name}`;
      if (expr.kind === "index")
        return this.expr(expr);
      return `(${this.expr(expr)})`;
    }
    ref(name) {
      const found = this.lookup(name);
      if (!found)
        return name === "globalThis" ? "globalThis" : `globalThis.${name}`;
      if (found.kind === "builtin")
        return BUILTIN_JS[name] ?? name;
      return name;
    }
    assignable(name, node) {
      const found = this.lookup(name);
      if (!found)
        this.oops(node, `${name} is not declared`);
      if (found.kind === "builtin")
        this.oops(node, `${name} is a Magic word. Pick another name`);
      if (found.kind === "import")
        this.oops(node, `${name} is imported. Pick another name`);
      if (found.kind === "fn")
        this.oops(node, `${name} is a function`);
      if (found.kind === "class")
        this.oops(node, `${name} is a class`);
      return name;
    }
    selfRef(node) {
      if (!this.selfExpr)
        this.oops(node, "self belongs inside a class");
      return this.selfExpr;
    }
    analyze(program) {
      const moduleScope = { kind: "module", names: /* @__PURE__ */ new Map(), parent: this.root };
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
        case "import":
          if (scope.kind !== "module")
            this.oops(stmt, "import belongs at the top of the script");
          if (stmt.form === "namespace" && stmt.alias)
            this.declare(scope, stmt.alias, "import", stmt);
          for (const name of stmt.names)
            this.declare(scope, name.local, "import", stmt);
          return;
        case "fn":
          this.declare(scope, stmt.name, "fn", stmt);
          return;
        case "class":
          if (scope.kind !== "module")
            this.oops(stmt, "class belongs at the top of the script");
          this.declare(scope, stmt.name, "class", stmt);
          return;
        case "let":
          this.declare(scope, stmt.name, "let", stmt);
          return;
        case "for":
          this.declare(scope, stmt.name, "let", stmt, true);
          this.scanSurface(stmt.body, scope);
          return;
        case "if":
          for (const arm of stmt.arms)
            this.scanSurface(arm.body, scope);
          if (stmt.elseBody)
            this.scanSurface(stmt.elseBody, scope);
          return;
        case "while":
        case "repeat":
          this.scanSurface(stmt.body, scope);
          return;
        case "assign":
          this.scanAssign(stmt, scope);
          return;
        default:
          return;
      }
    }
    scanAssign(stmt, scope) {
      if (stmt.target.kind !== "name")
        return;
      const found = this.lookupFrom(scope, stmt.target.name);
      if (!found) {
        scope.names.set(stmt.target.name, "let");
        return;
      }
      if (found.kind === "builtin")
        this.oops(stmt, `${stmt.target.name} is a Magic word. Pick another name`);
      if (found.kind === "import")
        this.oops(stmt, `${stmt.target.name} is imported. Pick another name`);
      if (found.kind === "fn")
        this.oops(stmt, `${stmt.target.name} is a function`);
      if (found.kind === "class")
        this.oops(stmt, `${stmt.target.name} is a class`);
    }
    scanNested(body, scope) {
      for (const stmt of body)
        this.nestStmt(stmt, scope);
    }
    nestStmt(stmt, scope) {
      switch (stmt.kind) {
        case "fn":
          this.analyzeFunction(stmt.body, stmt.params, scope, stmt);
          return;
        case "class":
          for (const method of stmt.methods)
            this.analyzeFunction(method.body, method.params, scope, method);
          for (const field of stmt.fields)
            this.nestExpr(field.init, scope);
          return;
        case "if":
          for (const arm of stmt.arms) {
            this.nestExpr(arm.test, scope);
            this.scanNested(arm.body, scope);
          }
          if (stmt.elseBody)
            this.scanNested(stmt.elseBody, scope);
          return;
        case "while":
          this.nestExpr(stmt.test, scope);
          this.scanNested(stmt.body, scope);
          return;
        case "repeat":
          this.scanNested(stmt.body, scope);
          this.nestExpr(stmt.test, scope);
          return;
        case "for":
          this.nestExpr(stmt.from, scope);
          this.nestExpr(stmt.to, scope);
          this.nestExpr(stmt.step, scope);
          this.nestExpr(stmt.iter, scope);
          this.scanNested(stmt.body, scope);
          return;
        case "let":
          this.nestExpr(stmt.init, scope);
          return;
        case "assign":
          this.nestExpr(stmt.target, scope);
          this.nestExpr(stmt.value, scope);
          return;
        case "print":
          for (const arg of stmt.args)
            this.nestExpr(arg, scope);
          return;
        case "expr":
          this.nestExpr(stmt.expr, scope);
          return;
        case "return":
          this.nestExpr(stmt.value, scope);
          return;
        default:
          return;
      }
    }
    analyzeFunction(body, params, parent, key) {
      const inner = this.child(parent, "function");
      for (const param of params)
        this.declare(inner, param, "param", key);
      this.analyzeBody(body, inner, key);
    }
    nestExpr(expr, scope) {
      if (!expr)
        return;
      switch (expr.kind) {
        case "fn":
          this.analyzeFunction(expr.body, expr.params, scope, expr);
          return;
        case "unary":
          this.nestExpr(expr.expr, scope);
          return;
        case "binary":
          this.nestExpr(expr.left, scope);
          this.nestExpr(expr.right, scope);
          return;
        case "call":
        case "new":
          this.nestExpr(expr.callee, scope);
          for (const arg of expr.args)
            this.nestExpr(arg, scope);
          return;
        case "member":
          this.nestExpr(expr.object, scope);
          return;
        case "index":
          this.nestExpr(expr.object, scope);
          this.nestExpr(expr.index, scope);
          return;
        case "list":
          for (const item of expr.items)
            this.nestExpr(item, scope);
          return;
        case "record":
          for (const field of expr.fields)
            this.nestExpr(field.value, scope);
          return;
        case "super":
          for (const arg of expr.args)
            this.nestExpr(arg, scope);
          return;
        default:
          return;
      }
    }
    declare(scope, name, kind, node, reuse = false) {
      const existing = scope.names.get(name);
      if (existing) {
        if (reuse && (existing === "let" || existing === "param"))
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
      return { kind, names: /* @__PURE__ */ new Map(), parent };
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
        selfExpr: this.selfExpr
      };
    }
    restoreFlags(flags) {
      this.allowSuper = flags.allowSuper;
      this.superName = flags.superName;
      this.selfExpr = flags.selfExpr;
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
      this.scope = { kind: "module", names: /* @__PURE__ */ new Map(), parent: this.root };
      this.selfExpr = null;
      this.superName = null;
      this.allowSuper = false;
      this.loop = 0;
      this.fnDepth = 0;
      this.temps = 0;
      this.readyClasses.clear();
      this.programKey = {};
    }
    oops(node, message) {
      throw new MagicError(message, node.line, node.column, this.filename);
    }
  };
  function compile(source, options) {
    return new Compiler().compile(source, options);
  }
  function defaultResolve(specifier) {
    const engine = engineKey(specifier);
    if (engine)
      return ENGINES[engine].package;
    if (isMagicSpecifier(specifier)) {
      const withExt = specifier.endsWith(".magic") ? specifier : `${specifier}.magic`;
      return withExt.replace(/\.magic$/, ".js");
    }
    return specifier;
  }
  function importsOf(program) {
    return program.body.filter((stmt) => stmt.kind === "import");
  }
  function builtinScope() {
    const names = /* @__PURE__ */ new Map();
    for (const name of BUILTIN_NAMES)
      names.set(name, "builtin");
    return { kind: "function", names, parent: null };
  }
  var Writer = class {
    lines = [];
    indent;
    constructor(indent = 0) {
      this.indent = indent;
    }
    line(text = "") {
      if (!text)
        this.lines.push("");
      else
        this.lines.push(`${"  ".repeat(this.indent)}${text}`);
    }
    push() {
      this.indent += 1;
    }
    pop() {
      this.indent = Math.max(0, this.indent - 1);
    }
    text() {
      return `${this.lines.join("\n")}
`;
    }
  };
  return __toCommonJS(browser_exports);
})();
globalThis.EmojiEngineMagic = EmojiEngineMagic;
globalThis.Magic = EmojiEngineMagic;
