import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

const WORKSPACE = join(__dirname, '../../../..');
const PROBE = join(WORKSPACE, '__app_event_probe__.ts');
const VOCABULARY = join(WORKSPACE, 'libs/bridge-messages/src');

const OPTIONS: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts'],
    types: [],
    paths: { '@chatic/bridge-messages': [join(WORKSPACE, 'libs/bridge-messages/src/index.ts')] },
};

const parsed = new Map<string, ts.SourceFile>();
let previous: ts.Program | undefined;
let vocabularyChecked = false;

const message = (diagnostic: ts.Diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');

const compile = (source: string) => {
    const host = ts.createCompilerHost(OPTIONS);
    const read = host.getSourceFile;
    const exists = host.fileExists;
    host.getSourceFile = (file, language) => {
        if (file === PROBE) return ts.createSourceFile(file, source, language, true);
        if (!parsed.has(file)) {
            const sourceFile = read(file, language);
            if (sourceFile) parsed.set(file, sourceFile);
        }
        return parsed.get(file);
    };
    host.fileExists = file => file === PROBE || exists(file);
    previous = ts.createProgram({ rootNames: [PROBE], options: OPTIONS, host, oldProgram: previous });
    if (!vocabularyChecked) {
        const broken = previous
            .getSourceFiles()
            .filter(file => file.fileName.startsWith(VOCABULARY))
            .flatMap(file => previous?.getSemanticDiagnostics(file) ?? []);
        if (broken.length > 0) throw new Error(`Vocabulary does not compile: ${broken.map(message).join('; ')}`);
        vocabularyChecked = true;
    }
    const probe = previous.getSourceFile(PROBE) as ts.SourceFile;
    const diagnostics = ts.getPreEmitDiagnostics(previous, probe);
    return { checker: previous.getTypeChecker(), probe, diagnostics };
};

const literalsOf = (source: string): string[] => {
    const { checker, probe, diagnostics } = compile(source);
    if (diagnostics.length > 0) throw new Error(`Vocabulary probe failed: ${diagnostics.map(message).join('; ')}`);
    const alias = probe.statements.find(ts.isTypeAliasDeclaration) as ts.TypeAliasDeclaration;
    const type = checker.getTypeAtLocation(alias.name);
    const members = type.isUnion() ? type.types : [type];
    return members.filter(member => member.isStringLiteral()).map(member => (member as ts.StringLiteralType).value);
};

export const appMessageTypes = (): string[] =>
    literalsOf(`import type { AppMessageDataMap } from '@chatic/bridge-messages';
export type Probe = keyof AppMessageDataMap;`);

export const appInitiatedTypes = (): string[] =>
    literalsOf(`import type { AppMessageDataMap, WEB_MESSAGE_RESPONSE_TYPE } from '@chatic/bridge-messages';
export type Probe = Exclude<keyof AppMessageDataMap, (typeof WEB_MESSAGE_RESPONSE_TYPE)[keyof typeof WEB_MESSAGE_RESPONSE_TYPE]>;`);

const WIRE = `type Wire<T> = 0 extends 1 & T ? T : T extends string ? \`\${T}\` : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;`;

export const pushedEventErrors = (messages: readonly unknown[]): string[] => {
    if (messages.length === 0) return ['nothing was pushed'];
    const errors: string[] = [];
    const lines = messages.map((pushed, index) => {
        const type = (pushed as { type?: unknown } | null)?.type;
        if (typeof type !== 'string') {
            errors.push(`#${index}: pushed without a string \`type\``);
            return '';
        }
        return `export const m${index}: Wire<AppMessageData<${JSON.stringify(type)}>> = ${JSON.stringify(pushed)};`;
    });
    const { probe, diagnostics } = compile(
        [`import type { AppMessageData } from '@chatic/bridge-messages';`, WIRE, ...lines].join('\n')
    );
    for (const diagnostic of diagnostics) {
        const index = probe.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line - 2;
        const type = (messages[index] as { type?: string } | undefined)?.type;
        errors.push(type ? `#${index} ${type}: ${message(diagnostic)}` : `probe: ${message(diagnostic)}`);
    }
    return errors;
};

export const pushedEvents = (pushEvent: { mock: { calls: unknown[][] } }): unknown[] =>
    pushEvent.mock.calls.map(([pushed]) => pushed);

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)]
    );

export const pushEventSites = (root: string): Record<string, string[]> => {
    const sites: Record<string, Set<string>> = {};
    const record = (type: string, file: string) => (sites[type] ??= new Set()).add(relative(root, file));

    for (const file of sourceFiles(root)) {
        if (!/\.tsx?$/.test(file) || /\.(test|spec)\.tsx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
        const text = readFileSync(file, 'utf8');
        if (!text.includes('pushEvent')) continue;
        const visit = (node: ts.Node): void => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'pushEvent'
            ) {
                let [argument] = node.arguments;
                while (
                    argument &&
                    (ts.isAsExpression(argument) ||
                        ts.isSatisfiesExpression(argument) ||
                        ts.isParenthesizedExpression(argument))
                ) {
                    argument = argument.expression;
                }
                const typeProperty =
                    argument && ts.isObjectLiteralExpression(argument)
                        ? argument.properties.find(
                              (property): property is ts.PropertyAssignment =>
                                  ts.isPropertyAssignment(property) &&
                                  ts.isIdentifier(property.name) &&
                                  property.name.text === 'type'
                          )
                        : undefined;
                const literal = typeProperty?.initializer;
                record(literal && ts.isStringLiteralLike(literal) ? literal.text : '<non-literal>', file);
            }
            ts.forEachChild(node, visit);
        };
        visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    }

    return Object.fromEntries(
        Object.entries(sites)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([type, files]) => [type, [...files].sort()])
    );
};
