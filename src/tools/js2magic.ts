#!/usr/bin/env node
/**
 * Turn JavaScript or TypeScript into a first-draft Magic script.
 * The output is meant to be readable, then edited. It does not cover every JS form.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import { MagicError } from '../error.js';

const HELP = `js2magic converts JavaScript or TypeScript into Magic.

  js2magic file.js
  js2magic file.ts -o file.magic
  js2magic file.ts --strict

Prints Magic on stdout unless -o names a file. --strict puts @strict at the top.
`;

interface Options {
  help: boolean;
  strict: boolean;
  file: string | null;
  out: string | null;
}

function main(): void {
  const options = parse(process.argv.slice(2));
  if (options.help || !options.file) {
    process.stdout.write(HELP);
    if (!options.help && !options.file) process.exit(1);
    return;
  }
  const abs = path.resolve(options.file);
  if (!fs.existsSync(abs)) throw new MagicError(`cannot find ${options.file}`);
  const source = fs.readFileSync(abs, 'utf8');
  const magic = convert(source, abs, { forceStrict: options.strict });
  if (options.out) fs.writeFileSync(path.resolve(options.out), magic);
  else process.stdout.write(magic);
}

function parse(argv: string[]): Options {
  const options: Options = { help: false, strict: false, file: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '-o' || arg === '--out') {
      const value = argv[i + 1];
      if (!value) throw new MagicError(`${arg} needs a file`);
      options.out = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new MagicError(`unknown flag ${arg}. Try js2magic --help`);
    if (!options.file) options.file = arg;
  }
  return options;
}

export function convert(source: string, filename: string, options: { forceStrict?: boolean } = {}): string {
  const kind = /\.tsx$/i.test(filename)
    ? ts.ScriptKind.TSX
    : /\.ts$/i.test(filename)
      ? ts.ScriptKind.TS
      : /\.jsx$/i.test(filename)
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind);
  const out = new Emitter();
  for (const stmt of file.statements) out.stmt(stmt);
  let text = out.finish();
  if (options.forceStrict || out.usedStrict) text = `@strict\n\n${text}`;
  if (!text.endsWith('\n')) text += '\n';
  return text;
}

class Emitter {
  usedStrict = false;
  private readonly lines: string[] = [];
  private indent = 0;

  finish(): string {
    while (this.lines.length && this.lines[this.lines.length - 1] === '') this.lines.pop();
    return `${this.lines.join('\n')}\n`;
  }

  stmt(node: ts.Statement): void {
    if (ts.isImportDeclaration(node)) {
      this.importDecl(node);
      return;
    }
    if (ts.isExportAssignment(node)) {
      this.line(`-- export default is not a Magic form`);
      this.exprStmt(node.expression);
      return;
    }
    if (ts.isFunctionDeclaration(node)) {
      this.fnDecl(node);
      return;
    }
    if (ts.isClassDeclaration(node)) {
      this.classDecl(node);
      return;
    }
    if (ts.isVariableStatement(node)) {
      this.varStmt(node);
      return;
    }
    if (ts.isIfStatement(node)) {
      this.ifStmt(node);
      return;
    }
    if (ts.isWhileStatement(node)) {
      this.whileStmt(node);
      return;
    }
    if (ts.isDoStatement(node)) {
      this.doStmt(node);
      return;
    }
    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      this.forInStmt(node);
      return;
    }
    if (ts.isForStatement(node)) {
      this.forStmt(node);
      return;
    }
    if (ts.isReturnStatement(node)) {
      this.line(node.expression ? `return ${this.expr(node.expression)}` : 'return');
      return;
    }
    if (ts.isBreakStatement(node)) {
      this.line('break');
      return;
    }
    if (ts.isContinueStatement(node)) {
      this.line('continue');
      return;
    }
    if (ts.isThrowStatement(node)) {
      this.line(`throw ${this.expr(node.expression)}`);
      return;
    }
    if (ts.isTryStatement(node)) {
      this.tryStmt(node);
      return;
    }
    if (ts.isSwitchStatement(node)) {
      this.switchStmt(node);
      return;
    }
    if (ts.isExpressionStatement(node)) {
      this.exprStmt(node.expression);
      return;
    }
    if (ts.isBlock(node)) {
      for (const inner of node.statements) this.stmt(inner);
      return;
    }
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
      this.line(`-- skipped ${node.name.text}`);
      return;
    }
    if (ts.isEmptyStatement(node) || ts.isDebuggerStatement(node)) return;
    this.line(`-- skipped: ${node.kind}`);
  }

  private importDecl(node: ts.ImportDeclaration): void {
    const spec = this.modulePath(node.moduleSpecifier);
    const clause = node.importClause;
    if (!clause) {
      this.line(`import ${this.quote(spec)}`);
      return;
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      this.line(`import ${this.quote(spec)} as ${clause.namedBindings.name.text}`);
      return;
    }
    const names: string[] = [];
    if (clause.name) names.push(`default as ${clause.name.text}`);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        const imported = el.propertyName ? el.propertyName.text : el.name.text;
        names.push(imported === el.name.text ? imported : `${imported} as ${el.name.text}`);
      }
    }
    if (names.length === 0) {
      this.line(`import ${this.quote(spec)}`);
      return;
    }
    this.line(`import ${names.join(', ')} from ${this.quote(spec)}`);
  }

  private modulePath(expr: ts.Expression): string {
    let spec = ts.isStringLiteral(expr) ? expr.text : this.expr(expr);
    if (/^\.\.?\//.test(spec)) spec = spec.replace(/\.(tsx?|jsx?)$/i, '.magic');
    return spec;
  }

  private fnDecl(node: ts.FunctionDeclaration): void {
    const name = node.name?.text ?? 'fn';
    const async = modifiersInclude(node, ts.SyntaxKind.AsyncKeyword);
    this.line(`${async ? 'async ' : ''}fn ${name}(${this.params(node.parameters)})${this.asType(node.type)}`);
    this.push();
    if (node.body) for (const inner of node.body.statements) this.stmt(inner);
    this.pop();
    this.line('end');
    this.blank();
  }

  private classDecl(node: ts.ClassDeclaration): void {
    const name = node.name?.text ?? 'Class';
    const parent = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
    const parentName = parent?.types[0] ? this.expr(parent.types[0].expression) : null;
    this.line(parentName ? `class ${name} is ${parentName}` : `class ${name}`);
    this.push();
    for (const member of node.members) this.classMember(member);
    this.pop();
    this.line('end');
    this.blank();
  }

  private classMember(member: ts.ClassElement): void {
    if (ts.isPropertyDeclaration(member)) {
      const name = this.memberName(member.name);
      if (name === 'new') {
        this.line('-- skipped field named new');
        return;
      }
      const access = this.access(member);
      const type = this.asType(member.type);
      const init = member.initializer ? this.expr(member.initializer) : 'nil';
      this.line(`${access}${name}${type} = ${init}`);
      return;
    }
    if (ts.isConstructorDeclaration(member)) {
      const access = this.access(member);
      this.line(`${access}fn new(${this.params(member.parameters)})`);
      this.push();
      if (member.body) for (const inner of member.body.statements) this.stmt(inner);
      this.pop();
      this.line('end');
      return;
    }
    if (ts.isMethodDeclaration(member)) {
      const name = this.memberName(member.name);
      const access = this.access(member);
      const async = modifiersInclude(member, ts.SyntaxKind.AsyncKeyword);
      this.line(`${access}${async ? 'async ' : ''}fn ${name}(${this.params(member.parameters)})${this.asType(member.type)}`);
      this.push();
      if (member.body) for (const inner of member.body.statements) this.stmt(inner);
      this.pop();
      this.line('end');
      return;
    }
    this.line('-- skipped a class member');
  }

  private varStmt(node: ts.VariableStatement): void {
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) {
        this.line(`-- skipped destructuring`);
        continue;
      }
      const type = this.asType(decl.type);
      if (!decl.initializer) {
        this.line(`let ${decl.name.text}${type}`);
        continue;
      }
      if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
        this.fnValue(decl.name.text, decl.initializer);
        continue;
      }
      this.line(`let ${decl.name.text}${type} = ${this.expr(decl.initializer)}`);
    }
  }

  private fnValue(name: string, fn: ts.ArrowFunction | ts.FunctionExpression): void {
    const async = modifiersInclude(fn, ts.SyntaxKind.AsyncKeyword);
    this.line(`let ${name} = ${async ? 'async ' : ''}fn(${this.params(fn.parameters)})${this.asType(fn.type)}`);
    this.push();
    if (ts.isBlock(fn.body)) {
      for (const inner of fn.body.statements) this.stmt(inner);
    } else {
      this.line(`return ${this.expr(fn.body)}`);
    }
    this.pop();
    this.line('end');
  }

  private ifStmt(node: ts.IfStatement, word = 'if'): void {
    this.line(`${word} ${this.expr(node.expression)} then`);
    this.push();
    this.stmt(node.thenStatement);
    this.pop();
    if (node.elseStatement && ts.isIfStatement(node.elseStatement)) {
      this.ifStmt(node.elseStatement, 'elseif');
      return;
    }
    if (node.elseStatement) {
      this.line('else');
      this.push();
      this.stmt(node.elseStatement);
      this.pop();
    }
    if (word === 'if') this.line('end');
  }

  private whileStmt(node: ts.WhileStatement): void {
    this.line(`while ${this.expr(node.expression)}`);
    this.push();
    this.stmt(node.statement);
    this.pop();
    this.line('end');
  }

  private doStmt(node: ts.DoStatement): void {
    this.line('repeat');
    this.push();
    this.stmt(node.statement);
    this.pop();
    this.line(`until not (${this.expr(node.expression)})`);
  }

  private forInStmt(node: ts.ForOfStatement | ts.ForInStatement): void {
    const name = this.forBinder(node.initializer);
    this.line(`for ${name} in ${this.expr(node.expression)}`);
    this.push();
    this.stmt(node.statement);
    this.pop();
    this.line('end');
  }

  private forStmt(node: ts.ForStatement): void {
    const counted = this.countedFor(node);
    if (counted) {
      this.line(`for ${counted.name} = ${counted.from} to ${counted.to}${counted.step}`);
      this.push();
      this.stmt(node.statement);
      this.pop();
      this.line('end');
      return;
    }
    if (node.initializer) {
      if (ts.isVariableDeclarationList(node.initializer)) {
        for (const decl of node.initializer.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            this.line(`let ${decl.name.text} = ${this.expr(decl.initializer)}`);
          }
        }
      } else {
        this.exprStmt(node.initializer);
      }
    }
    this.line(`while ${node.condition ? this.expr(node.condition) : 'true'}`);
    this.push();
    this.stmt(node.statement);
    if (node.incrementor) this.exprStmt(node.incrementor);
    this.pop();
    this.line('end');
  }

  private countedFor(node: ts.ForStatement): { name: string; from: string; to: string; step: string } | null {
    if (!node.initializer || !node.condition || !node.incrementor) return null;
    if (!ts.isVariableDeclarationList(node.initializer) || node.initializer.declarations.length !== 1) return null;
    const decl = node.initializer.declarations[0]!;
    if (!ts.isIdentifier(decl.name) || !decl.initializer) return null;
    const name = decl.name.text;
    if (!ts.isBinaryExpression(node.condition)) return null;
    if (!ts.isIdentifier(node.condition.left) || node.condition.left.text !== name) return null;
    const op = node.condition.operatorToken.kind;
    let to = this.expr(node.condition.right);
    if (op === ts.SyntaxKind.LessThanToken) to = `${to} - 1`;
    else if (op !== ts.SyntaxKind.LessThanEqualsToken) return null;
    const inc = node.incrementor;
    let step = '';
    if (ts.isPostfixUnaryExpression(inc) || ts.isPrefixUnaryExpression(inc)) {
      const operand = ts.isPostfixUnaryExpression(inc) ? inc.operand : inc.operand;
      if (!ts.isIdentifier(operand) || operand.text !== name) return null;
      const kind = ts.isPostfixUnaryExpression(inc) ? inc.operator : inc.operator;
      if (kind === ts.SyntaxKind.PlusPlusToken) step = '';
      else if (kind === ts.SyntaxKind.MinusMinusToken) step = ' step -1';
      else return null;
    } else {
      return null;
    }
    return { name, from: this.expr(decl.initializer), to, step };
  }

  private tryStmt(node: ts.TryStatement): void {
    this.line('try');
    this.push();
    this.stmt(node.tryBlock);
    this.pop();
    if (node.catchClause) {
      const name = node.catchClause.variableDeclaration && ts.isIdentifier(node.catchClause.variableDeclaration.name)
        ? node.catchClause.variableDeclaration.name.text
        : null;
      this.line(name ? `catch ${name}` : 'catch');
      this.push();
      this.stmt(node.catchClause.block);
      this.pop();
    }
    if (node.finallyBlock) {
      this.line('finally');
      this.push();
      this.stmt(node.finallyBlock);
      this.pop();
    }
    this.line('end');
  }

  private switchStmt(node: ts.SwitchStatement): void {
    const value = this.expr(node.expression);
    let word = 'if';
    for (const clause of node.caseBlock.clauses) {
      if (ts.isDefaultClause(clause)) {
        this.line('else');
        this.push();
        for (const inner of clause.statements) {
          if (ts.isBreakStatement(inner)) continue;
          this.stmt(inner);
        }
        this.pop();
        continue;
      }
      this.line(`${word} ${value} == ${this.expr(clause.expression)} then`);
      this.push();
      for (const inner of clause.statements) {
        if (ts.isBreakStatement(inner)) continue;
        this.stmt(inner);
      }
      this.pop();
      word = 'elseif';
    }
    this.line('end');
  }

  private exprStmt(expr: ts.Expression): void {
    if (ts.isCallExpression(expr) && this.isConsoleLog(expr)) {
      const args = expr.arguments.map((arg) => this.expr(arg)).join(', ');
      this.line(args ? `print ${args}` : 'print');
      return;
    }
    if (ts.isPrefixUnaryExpression(expr) || ts.isPostfixUnaryExpression(expr)) {
      const op = ts.isPrefixUnaryExpression(expr) ? expr.operator : expr.operator;
      const operand = ts.isPrefixUnaryExpression(expr) ? expr.operand : expr.operand;
      if (op === ts.SyntaxKind.PlusPlusToken) {
        this.line(`${this.expr(operand)} += 1`);
        return;
      }
      if (op === ts.SyntaxKind.MinusMinusToken) {
        this.line(`${this.expr(operand)} -= 1`);
        return;
      }
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      this.line(`${this.expr(expr.left)} = ${this.expr(expr.right)}`);
      return;
    }
    if (ts.isBinaryExpression(expr) && isAssignOp(expr.operatorToken.kind)) {
      this.line(`${this.expr(expr.left)} ${expr.operatorToken.getText()} ${this.expr(expr.right)}`);
      return;
    }
    this.line(this.expr(expr));
  }

  expr(node: ts.Expression): string {
    if (ts.isParenthesizedExpression(node)) return `(${this.expr(node.expression)})`;
    if (ts.isIdentifier(node)) return node.text === 'undefined' ? 'nil' : node.text;
    if (node.kind === ts.SyntaxKind.ThisKeyword) return 'self';
    if (node.kind === ts.SyntaxKind.SuperKeyword) return 'super';
    if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.UndefinedKeyword) return 'nil';
    if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true';
    if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false';
    if (ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)) return node.text.replace(/n$/, '');
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return this.quote(node.text);
    if (ts.isTemplateExpression(node)) return this.template(node);
    if (ts.isArrayLiteralExpression(node)) {
      const items = node.elements.map((el) => (ts.isOmittedExpression(el) ? 'nil' : ts.isSpreadElement(el) ? `/*spread*/ ${this.expr(el.expression)}` : this.expr(el)));
      return `[${items.join(', ')}]`;
    }
    if (ts.isObjectLiteralExpression(node)) return this.object(node);
    if (ts.isPropertyAccessExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.SuperKeyword) return `super.${node.name.text}`;
      return `${this.expr(node.expression)}.${node.name.text}`;
    }
    if (ts.isElementAccessExpression(node)) {
      return `${this.expr(node.expression)}[${node.argumentExpression ? this.expr(node.argumentExpression) : 'nil'}]`;
    }
    if (ts.isCallExpression(node)) {
      if (this.isConsoleLog(node)) {
        const args = node.arguments.map((arg) => this.expr(arg)).join(', ');
        return args ? `/* print */ (${args})` : '/* print */';
      }
      const callee = this.expr(node.expression);
      const args = node.arguments.map((arg) => this.expr(arg)).join(', ');
      if (node.expression.kind === ts.SyntaxKind.SuperKeyword) return `super(${args})`;
      return `${callee}(${args})`;
    }
    if (ts.isNewExpression(node)) {
      const args = (node.arguments ?? []).map((arg) => this.expr(arg)).join(', ');
      return `new ${this.expr(node.expression)}(${args})`;
    }
    if (ts.isAwaitExpression(node)) return `await ${this.expr(node.expression)}`;
    if (ts.isTypeOfExpression(node)) return `type(${this.expr(node.expression)})`;
    if (ts.isPrefixUnaryExpression(node)) {
      if (node.operator === ts.SyntaxKind.ExclamationToken) return `not ${this.expr(node.operand)}`;
      if (node.operator === ts.SyntaxKind.MinusToken) return `-${this.expr(node.operand)}`;
      if (node.operator === ts.SyntaxKind.PlusPlusToken) return `${this.expr(node.operand)} /* ++ */`;
      if (node.operator === ts.SyntaxKind.MinusMinusToken) return `${this.expr(node.operand)} /* -- */`;
      return this.expr(node.operand);
    }
    if (ts.isPostfixUnaryExpression(node)) return this.expr(node.operand);
    if (ts.isBinaryExpression(node)) return this.binary(node);
    if (ts.isConditionalExpression(node)) {
      return `(${this.expr(node.condition)} and ${this.expr(node.whenTrue)} or ${this.expr(node.whenFalse)})`;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return this.inlineFn(node);
    if (ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
      return this.expr(node.expression);
    }
    if (ts.isTypeAssertionExpression(node)) {
      return this.expr(node.expression);
    }
    if (ts.isSpreadElement(node)) return this.expr(node.expression);
    return `/* ${ts.SyntaxKind[node.kind]} */`;
  }

  private inlineFn(fn: ts.ArrowFunction | ts.FunctionExpression): string {
    const async = modifiersInclude(fn, ts.SyntaxKind.AsyncKeyword);
    const params = this.params(fn.parameters);
    const type = this.asType(fn.type);
    if (!ts.isBlock(fn.body)) {
      return `${async ? 'async ' : ''}fn(${params})${type}\n${this.pad()}  return ${this.expr(fn.body)}\n${this.pad()}end`;
    }
    const inner = new Emitter();
    inner.indent = this.indent + 1;
    for (const stmt of fn.body.statements) inner.stmt(stmt);
    const body = inner.lines.length ? `\n${inner.lines.join('\n')}\n${this.pad()}` : '\n' + this.pad();
    return `${async ? 'async ' : ''}fn(${params})${type}${body}end`;
  }

  private binary(node: ts.BinaryExpression): string {
    const left = this.expr(node.left);
    const right = this.expr(node.right);
    const kind = node.operatorToken.kind;
    const op =
      kind === ts.SyntaxKind.EqualsEqualsEqualsToken || kind === ts.SyntaxKind.EqualsEqualsToken
        ? '=='
        : kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || kind === ts.SyntaxKind.ExclamationEqualsToken
          ? '!='
          : kind === ts.SyntaxKind.AmpersandAmpersandToken
            ? 'and'
            : kind === ts.SyntaxKind.BarBarToken
              ? 'or'
              : kind === ts.SyntaxKind.PlusToken && (looksLikeText(node.left) || looksLikeText(node.right))
                ? '..'
                : node.operatorToken.getText();
    return `${left} ${op} ${right}`;
  }

  private object(node: ts.ObjectLiteralExpression): string {
    const fields: string[] = [];
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : this.expr(prop.name as ts.Expression);
        fields.push(`${name}: ${this.expr(prop.initializer)}`);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        fields.push(`${prop.name.text}: ${prop.name.text}`);
      } else {
        fields.push('/* skipped */');
      }
    }
    return `{ ${fields.join(', ')} }`;
  }

  private template(node: ts.TemplateExpression): string {
    const parts: string[] = [];
    if (node.head.text) parts.push(this.quote(node.head.text));
    for (const span of node.templateSpans) {
      parts.push(this.expr(span.expression));
      if (span.literal.text) parts.push(this.quote(span.literal.text));
    }
    return parts.length ? parts.join(' .. ') : '""';
  }

  private params(params: readonly ts.ParameterDeclaration[]): string {
    return params
      .map((param) => {
        const name = ts.isIdentifier(param.name) ? param.name.text : 'arg';
        return `${name}${this.asType(param.type)}`;
      })
      .join(', ');
  }

  private asType(type: ts.TypeNode | undefined): string {
    if (!type) return '';
    const name = this.typeName(type);
    if (!name) return '';
    this.usedStrict = true;
    return ` as ${name}`;
  }

  private typeName(type: ts.TypeNode): string | null {
    if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      return mapTypeName(type.typeName.text);
    }
    switch (type.kind) {
      case ts.SyntaxKind.NumberKeyword:
        return 'number';
      case ts.SyntaxKind.StringKeyword:
        return 'string';
      case ts.SyntaxKind.BooleanKeyword:
        return 'bool';
      case ts.SyntaxKind.VoidKeyword:
      case ts.SyntaxKind.UndefinedKeyword:
      case ts.SyntaxKind.NullKeyword:
        return 'nil';
      case ts.SyntaxKind.AnyKeyword:
      case ts.SyntaxKind.UnknownKeyword:
        return 'any';
      default:
        break;
    }
    if (ts.isArrayTypeNode(type) || ts.isTupleTypeNode(type)) return 'list';
    if (ts.isFunctionTypeNode(type)) return 'fn';
    if (ts.isTypeLiteralNode(type)) return 'record';
    if (ts.isUnionTypeNode(type)) {
      const parts = type.types.map((inner) => this.typeName(inner)).filter((name): name is string => Boolean(name));
      const unique = [...new Set(parts)].filter((name) => name !== 'nil');
      return unique[0] ?? 'any';
    }
    return null;
  }

  private access(node: ts.ClassElement): string {
    const flags = ts.canHaveModifiers(node) ? ts.getCombinedModifierFlags(node) : 0;
    if (flags & ts.ModifierFlags.Private) {
      this.usedStrict = true;
      return 'private ';
    }
    if (flags & ts.ModifierFlags.Protected) {
      this.usedStrict = true;
      return 'protected ';
    }
    if (flags & ts.ModifierFlags.Public) {
      this.usedStrict = true;
      return 'public ';
    }
    return '';
  }

  private memberName(name: ts.PropertyName | undefined): string {
    if (!name) return 'fn';
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    if (ts.isPrivateIdentifier(name)) return name.text.replace(/^#/, '');
    return 'fn';
  }

  private forBinder(init: ts.ForInitializer): string {
    if (ts.isVariableDeclarationList(init) && init.declarations[0] && ts.isIdentifier(init.declarations[0].name)) {
      return init.declarations[0].name.text;
    }
    if (ts.isIdentifier(init)) return init.text;
    return 'item';
  }

  private isConsoleLog(node: ts.CallExpression): boolean {
    return (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console' &&
      node.expression.name.text === 'log'
    );
  }

  private quote(text: string): string {
    return JSON.stringify(text);
  }

  private line(text: string): void {
    this.lines.push(text ? `${this.pad()}${text}` : '');
  }

  private blank(): void {
    if (this.lines.length && this.lines[this.lines.length - 1] !== '') this.lines.push('');
  }

  private push(): void {
    this.indent += 1;
  }

  private pop(): void {
    this.indent = Math.max(0, this.indent - 1);
  }

  private pad(): string {
    return '  '.repeat(this.indent);
  }
}

function mapTypeName(name: string): string {
  if (name === 'Boolean') return 'bool';
  if (name === 'Number') return 'number';
  if (name === 'String') return 'string';
  if (name === 'Array') return 'list';
  if (name === 'Function') return 'fn';
  if (name === 'Object') return 'record';
  return name;
}

function looksLikeText(node: ts.Expression): boolean {
  return ts.isStringLiteral(node) || ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function isAssignOp(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.PlusEqualsToken ||
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken
  );
}

function modifiersInclude(node: ts.HasModifiers, kind: ts.SyntaxKind): boolean {
  return Boolean(node.modifiers?.some((mod) => mod.kind === kind));
}

const runningAsCli = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (runningAsCli) {
  try {
    main();
  } catch (error) {
    if (error instanceof MagicError) process.stderr.write(`${error.format()}\n`);
    else process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  }
}
