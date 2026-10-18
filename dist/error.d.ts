/**
 * A mistake in Magic source: a bad token, a broken phrase, or a name used
 * where it cannot go. `line` and `column` start at 1.
 */
export declare class MagicError extends Error {
    readonly line: number;
    readonly column: number;
    readonly filename: string;
    constructor(message: string, line?: number, column?: number, filename?: string);
    /** `file:line:column message`, ready for a terminal. */
    format(): string;
}
