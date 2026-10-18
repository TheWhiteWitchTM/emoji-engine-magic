import { MagicError } from './error.js';
import type { Token } from './token.js';

/** Words that always mean structure. Matched without regard to case. */
const KEYWORDS = new Set([
  'import',
  'from',
  'class',
  'fn',
  'end',
  'if',
  'then',
  'else',
  'elseif',
  'for',
  'while',
  'repeat',
  'until',
  'return',
  'break',
  'continue',
  'let',
  'print',
  'and',
  'or',
  'not',
  'true',
  'false',
  'nil',
  'new',
  'self',
  'super',
]);

/**
 * Turns Magic source into tokens. A newline is a token, because a new line
 * ends a statement the way it does in BASIC. `--` and a leading `REM` are comments.
 */
export class Lexer {
  private readonly source: string;
  private readonly filename: string;
  private i = 0;
  private line = 1;
  private column = 1;
  private atLineStart = true;

  constructor(source: string, filename = '') {
    this.source = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    this.filename = filename;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (!this.done()) {
      this.skipSpaces();
      if (this.done()) break;
      if (this.atLineStart && this.startsRemark()) {
        this.skipRemark();
        continue;
      }
      if (this.match('-', '-')) {
        this.skipToLineEnd();
        continue;
      }
      const token = this.one();
      if (!token) continue;
      tokens.push(token);
      this.atLineStart = token.kind === 'newline';
    }
    tokens.push({ kind: 'eof', value: '', line: this.line, column: this.column });
    return tokens;
  }

  private one(): Token | null {
    const line = this.line;
    const column = this.column;
    const ch = this.code();

    if (ch === 10 || ch === 13) {
      this.newline();
      return { kind: 'newline', value: '\n', line, column };
    }

    if (ch === 34 || ch === 39) return this.string(line, column);
    if (this.isDigit(ch) || (ch === 46 && this.isDigit(this.codeAt(1)))) return this.number(line, column);
    if (this.isIdentStart(ch)) return this.ident(line, column);

    const op = this.operator();
    if (op) return { kind: 'op', value: op, line, column };
    throw this.fail(line, column, `unexpected character ${JSON.stringify(this.char())}`);
  }

  private string(line: number, column: number): Token {
    const quote = this.char();
    this.bump();
    let value = '';
    while (!this.done()) {
      const ch = this.char();
      if (ch === quote) {
        this.bump();
        return { kind: 'string', value, line, column };
      }
      if (ch === '\n' || ch === '\r') {
        throw this.fail(this.line, this.column, 'a string has to end on the same line');
      }
      if (ch === '\\') {
        value += this.escape(line, column);
        continue;
      }
      value += this.bump();
    }
    throw this.fail(line, column, 'this string never ends');
  }

  private escape(line: number, column: number): string {
    this.bump();
    if (this.done()) throw this.fail(line, column, 'this string never ends');
    const ch = this.bump();
    switch (ch) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '0':
        return '\0';
      case '\\':
      case "'":
      case '"':
        return ch;
      case 'u':
        return this.unicode(line, column);
      default:
        throw this.fail(this.line, this.column, `unknown escape \\${ch}`);
    }
  }

  private unicode(line: number, column: number): string {
    if (this.char() === '{') {
      this.bump();
      let hex = '';
      while (this.isHex(this.code()) && hex.length < 6) hex += this.bump();
      if (this.char() !== '}' || hex.length === 0) {
        throw this.fail(line, column, 'a \\u{...} escape needs hex digits and a closing brace');
      }
      this.bump();
      const code = Number.parseInt(hex, 16);
      if (code > 0x10ffff) throw this.fail(line, column, 'that code point is too big');
      return String.fromCodePoint(code);
    }
    let hex = '';
    for (let n = 0; n < 4; n += 1) {
      if (!this.isHex(this.code())) throw this.fail(line, column, 'a \\u escape needs four hex digits');
      hex += this.bump();
    }
    return String.fromCodePoint(Number.parseInt(hex, 16));
  }

  private number(line: number, column: number): Token {
    const start = this.i;
    if (this.char() === '.') this.bump();
    while (this.isDigit(this.code())) this.bump();
    if (this.char() === '.' && this.isDigit(this.codeAt(1))) {
      this.bump();
      while (this.isDigit(this.code())) this.bump();
    }
    if (this.char() === 'e' || this.char() === 'E') {
      const mark = this.i;
      const markColumn = this.column;
      this.bump();
      if (this.char() === '+' || this.char() === '-') this.bump();
      if (!this.isDigit(this.code())) {
        this.i = mark;
        this.column = markColumn;
      } else {
        while (this.isDigit(this.code())) this.bump();
      }
    }
    const raw = this.source.slice(start, this.i);
    if (/^0\d/.test(raw)) {
      throw this.fail(line, column, `write ${Number(raw)} instead of ${raw}`);
    }
    return { kind: 'number', value: raw, line, column };
  }

  private ident(line: number, column: number): Token {
    let value = '';
    while (this.isIdentPart(this.code())) value += this.bump();
    const word = value.toLowerCase();
    if (KEYWORDS.has(word)) return { kind: 'keyword', value: word, line, column };
    return { kind: 'ident', value, line, column };
  }

  private operator(): string | null {
    const two = this.source.slice(this.i, this.i + 2);
    const pairs = ['==', '!=', '<>', '<=', '>=', '+=', '-=', '*=', '/=', '..'];
    if (pairs.includes(two)) {
      this.bump();
      this.bump();
      return two;
    }
    const one = this.char();
    if ('+-*/%^=<>()[]{},.:;&|#'.includes(one)) {
      this.bump();
      return one;
    }
    return null;
  }

  private startsRemark(): boolean {
    if (this.code() !== 82 && this.code() !== 114) return false;
    const rest = this.source.slice(this.i, this.i + 3).toLowerCase();
    if (rest !== 'rem') return false;
    const after = this.codeAt(3);
    return !this.isIdentPart(after);
  }

  private skipRemark(): void {
    this.skipToLineEnd();
    if (!this.done()) this.newline();
    this.atLineStart = true;
  }

  private skipToLineEnd(): void {
    while (!this.done() && this.code() !== 10 && this.code() !== 13) this.bump();
  }

  private skipSpaces(): void {
    while (!this.done()) {
      const ch = this.code();
      if (ch === 32 || ch === 9 || ch === 12 || ch === 11) {
        this.bump();
        continue;
      }
      break;
    }
  }

  private newline(): void {
    if (this.code() === 13 && this.codeAt(1) === 10) this.i += 2;
    else this.i += 1;
    this.line += 1;
    this.column = 1;
  }

  private match(a: string, b: string): boolean {
    return this.char() === a && this.source[this.i + a.length] === b;
  }

  private bump(): string {
    const cp = this.source.codePointAt(this.i) ?? 0;
    const size = cp > 0xffff ? 2 : 1;
    const ch = this.source.slice(this.i, this.i + size);
    this.i += size;
    this.column += 1;
    return ch;
  }

  private char(): string {
    return this.source[this.i] ?? '';
  }

  private code(): number {
    return this.source.codePointAt(this.i) ?? 0;
  }

  private codeAt(offset: number): number {
    return this.source.codePointAt(this.i + offset) ?? 0;
  }

  private done(): boolean {
    return this.i >= this.source.length;
  }

  private isDigit(code: number): boolean {
    return code >= 48 && code <= 57;
  }

  private isHex(code: number): boolean {
    return this.isDigit(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
  }

  private isIdentStart(code: number): boolean {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
  }

  private isIdentPart(code: number): boolean {
    return this.isIdentStart(code) || this.isDigit(code);
  }

  private fail(line: number, column: number, message: string): MagicError {
    return new MagicError(message, line, column, this.filename);
  }
}
