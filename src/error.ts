/**
 * A mistake in Magic source: a bad token, a broken phrase, or a name used
 * where it cannot go. `line` and `column` start at 1.
 */
export class MagicError extends Error {
  readonly line: number;
  readonly column: number;
  readonly filename: string;

  constructor(message: string, line = 1, column = 1, filename = '') {
    super(message);
    this.name = 'MagicError';
    this.line = line;
    this.column = column;
    this.filename = filename;
  }

  /** `file:line:column message`, ready for a terminal. */
  format(): string {
    const where = this.filename
      ? `${this.filename}:${this.line}:${this.column}`
      : `${this.line}:${this.column}`;
    return `${where} ${this.message}`;
  }
}
