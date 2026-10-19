export interface Node {
    line: number;
    column: number;
    /** Set when the script wrote `@name` above this node. */
    annotations?: Annotation[];
}
/** `@strict`, `@note("...")`, and any other `@name` or `@name(args)`. */
export interface Annotation extends Node {
    name: string;
    args: Expr[];
}
/** `public`, `private`, and `protected` on a class field or method. */
export type Access = 'public' | 'private' | 'protected';
/** A type name after `as`: `number`, `string`, `Box`, ... */
export interface TypeRef extends Node {
    name: string;
}
export interface Param extends Node {
    name: string;
    type: TypeRef | null;
}
export type Stmt = ImportStmt | FnStmt | ClassStmt | IfStmt | WhileStmt | ForStmt | RepeatStmt | ReturnStmt | BreakStmt | ContinueStmt | LetStmt | AssignStmt | ExprStmt | PrintStmt | TryStmt | ThrowStmt;
export interface Program extends Node {
    kind: 'program';
    body: Stmt[];
    filename: string;
    /** File-level annotations that were not attached to a statement. */
    annotations: Annotation[];
}
export interface ImportName {
    imported: string;
    local: string;
}
export interface ImportStmt extends Node {
    kind: 'import';
    form: 'side' | 'namespace' | 'named';
    specifier: string;
    /** Local name for `import "path" as name`. */
    alias: string | null;
    names: ImportName[];
}
export interface FnStmt extends Node {
    kind: 'fn';
    name: string;
    params: Param[];
    body: Stmt[];
    async: boolean;
    type: TypeRef | null;
}
export interface FieldStmt extends Node {
    name: string;
    init: Expr;
    access: Access | null;
    type: TypeRef | null;
}
export interface MethodStmt extends Node {
    name: string;
    params: Param[];
    body: Stmt[];
    async: boolean;
    access: Access | null;
    type: TypeRef | null;
}
export interface ClassStmt extends Node {
    kind: 'class';
    name: string;
    parent: string | null;
    fields: FieldStmt[];
    methods: MethodStmt[];
}
export interface IfArm extends Node {
    test: Expr;
    body: Stmt[];
}
export interface IfStmt extends Node {
    kind: 'if';
    arms: IfArm[];
    elseBody: Stmt[] | null;
}
export interface WhileStmt extends Node {
    kind: 'while';
    test: Expr;
    body: Stmt[];
}
export interface ForStmt extends Node {
    kind: 'for';
    name: string;
    /** Set for `for i = a to b`. */
    from: Expr | null;
    to: Expr | null;
    step: Expr | null;
    /** Set for `for item in bag`. */
    iter: Expr | null;
    body: Stmt[];
}
export interface RepeatStmt extends Node {
    kind: 'repeat';
    body: Stmt[];
    test: Expr;
}
export interface ReturnStmt extends Node {
    kind: 'return';
    value: Expr | null;
}
export interface BreakStmt extends Node {
    kind: 'break';
}
export interface ContinueStmt extends Node {
    kind: 'continue';
}
export interface LetStmt extends Node {
    kind: 'let';
    name: string;
    init: Expr | null;
    type: TypeRef | null;
}
export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=';
export interface AssignStmt extends Node {
    kind: 'assign';
    target: Expr;
    op: AssignOp;
    value: Expr;
}
export interface ExprStmt extends Node {
    kind: 'expr';
    expr: Expr;
}
export interface PrintStmt extends Node {
    kind: 'print';
    args: Expr[];
}
export interface TryStmt extends Node {
    kind: 'try';
    body: Stmt[];
    /** Bound only when the script wrote `catch name`. */
    catchName: string | null;
    catchBody: Stmt[] | null;
    finallyBody: Stmt[] | null;
}
export interface ThrowStmt extends Node {
    kind: 'throw';
    value: Expr;
}
export type Expr = NumberExpr | StringExpr | BoolExpr | NilExpr | NameExpr | SelfExpr | ListExpr | RecordExpr | UnaryExpr | BinaryExpr | CallExpr | MemberExpr | IndexExpr | NewExpr | FnExpr | SuperCallExpr | AwaitExpr;
export interface NumberExpr extends Node {
    kind: 'number';
    raw: string;
    value: number;
}
export interface StringExpr extends Node {
    kind: 'string';
    value: string;
}
export interface BoolExpr extends Node {
    kind: 'bool';
    value: boolean;
}
export interface NilExpr extends Node {
    kind: 'nil';
}
export interface NameExpr extends Node {
    kind: 'name';
    name: string;
}
export interface SelfExpr extends Node {
    kind: 'self';
}
export interface ListExpr extends Node {
    kind: 'list';
    items: Expr[];
}
export interface RecordField {
    name: string;
    value: Expr;
}
export interface RecordExpr extends Node {
    kind: 'record';
    fields: RecordField[];
}
export interface UnaryExpr extends Node {
    kind: 'unary';
    op: '-' | 'not' | '#';
    expr: Expr;
}
export interface BinaryExpr extends Node {
    kind: 'binary';
    op: string;
    left: Expr;
    right: Expr;
}
export interface CallExpr extends Node {
    kind: 'call';
    callee: Expr;
    args: Expr[];
}
export interface MemberExpr extends Node {
    kind: 'member';
    object: Expr;
    name: string;
}
export interface IndexExpr extends Node {
    kind: 'index';
    object: Expr;
    index: Expr;
}
export interface NewExpr extends Node {
    kind: 'new';
    callee: Expr;
    args: Expr[];
}
export interface FnExpr extends Node {
    kind: 'fn';
    params: Param[];
    body: Stmt[];
    async: boolean;
    type: TypeRef | null;
}
export interface AwaitExpr extends Node {
    kind: 'await';
    expr: Expr;
}
export interface SuperCallExpr extends Node {
    kind: 'super';
    /** Null calls the parent constructor. Otherwise a parent method name. */
    method: string | null;
    args: Expr[];
}
