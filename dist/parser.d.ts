import type { Program } from './ast.js';
/**
 * Turns tokens into a tree. One word closes every block: `end`.
 * `then` and `do` are optional. Names keep their case. Keywords do not.
 */
export declare class Parser {
    private tokens;
    private i;
    private readonly filename;
    private trailingAnnotations;
    constructor(filename?: string);
    parse(source: string): Program;
    private statements;
    private statement;
    private importStmt;
    private fnStmt;
    private classStmt;
    private method;
    private ifStmt;
    private whileStmt;
    private forStmt;
    private repeatStmt;
    private returnStmt;
    private letStmt;
    private printStmt;
    private tryStmt;
    private throwStmt;
    private assignOrCall;
    private condition;
    private expression;
    private unary;
    private newExpr;
    private postfix;
    private memberChain;
    private oneMember;
    private callAfter;
    private primary;
    private superExpr;
    private fnExpr;
    private group;
    private list;
    private record;
    private params;
    private argList;
    private binaryOp;
    private isTarget;
    private closes;
    private finish;
    /** A property can use a JavaScript word. A variable cannot. */
    private expectMemberName;
    /** `async` is a word before `fn`. It can still be a variable name. */
    private startsAsyncFn;
    /**
     * A name as it is exported by another module. JavaScript may export `default`
     * or a reserved word. The local binding still has to be a Magic name.
     */
    private expectImportedName;
    private asLocalName;
    /** `fn new` is the constructor. `new` stays a keyword everywhere else. */
    private methodName;
    private expectIdent;
    private expectKeyword;
    private expectOp;
    private expectKind;
    private eatOp;
    private eatWord;
    private skipNl;
    private peek;
    private next;
    private at;
    private stopText;
    private fail;
    private tag;
    private takeAnnotations;
    private annotation;
    private parseAsType;
    private parseType;
    private accessWord;
    private mergeAccess;
}
