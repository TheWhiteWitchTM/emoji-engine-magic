import type { Token } from './token.js';
/**
 * Turns Magic source into tokens. A newline is a token, because a new line
 * ends a statement the way it does in BASIC. `--` and a leading `REM` are comments.
 */
export declare class Lexer {
    private readonly source;
    private readonly filename;
    private i;
    private line;
    private column;
    private atLineStart;
    constructor(source: string, filename?: string);
    tokenize(): Token[];
    private one;
    private string;
    private escape;
    private unicode;
    private number;
    private ident;
    private operator;
    private startsRemark;
    private skipRemark;
    private skipToLineEnd;
    private skipSpaces;
    private newline;
    private match;
    private bump;
    private char;
    private code;
    private codeAt;
    private done;
    private isDigit;
    private isHex;
    private isIdentStart;
    private isIdentPart;
    private fail;
}
