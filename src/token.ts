export type TokenKind = 'eof' | 'newline' | 'ident' | 'number' | 'string' | 'keyword' | 'op';

export interface Token {
  kind: TokenKind;
  /** Keyword text is lower case. Identifiers keep their spelling. Strings are decoded. */
  value: string;
  line: number;
  column: number;
}
