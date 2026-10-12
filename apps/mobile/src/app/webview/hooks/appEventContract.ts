import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

/*
 * Test support for the app → web event contract. Imported by tests only; nothing in the app reaches
 * it, so it never enters the bundle. `apps/desktop/src/main/appEventContract.ts` is its twin — keep
 * the two in step.
 *
 * Why a compiler and not `satisfies`: jest transpiles each file on its own (`isolatedModules`), so a
 * type annotation in a test is never checked, and CI does not type check this project. Handing what
 * the shell actually pushed to the TypeScript compiler, as a literal assigned to the vocabulary's
 * own type, is the one check that reads `@chatic/app-messages` itself rather than a copy of it.
 */

const WORKSPACE = join(__dirname, '../../../../../..');
const PROBE = join(WORKSPACE, '__app_event_probe__.ts');
const VOCABULARY = join(WORKSPACE, 'libs/app-messages/src');

const OPTIONS: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts'],
    types: [],
    paths: { '@chatic/app-messages': [join(WORKSPACE, 'libs/app-messages/src/index.ts')] },
};

// The vocabulary and its imports parse once per test file; only the probe changes between checks.
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
    // A type the vocabulary cannot resolve (a missing react-native-iap, say) degrades to `any`, and
    // every payload built on it would then pass. The error lands in the vocabulary, not the probe.
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

/** The string literals of a type alias declared in a probe. Throws if the probe did not compile. */
const literalsOf = (source: string): string[] => {
    const { checker, probe, diagnostics } = compile(source);
    // A probe that fails to resolve the vocabulary reads as an empty union, and every check built on
    // it would then pass on nothing.
    if (diagnostics.length > 0) throw new Error(`Vocabulary probe failed: ${diagnostics.map(message).join('; ')}`);
    const alias = probe.statements.find(ts.isTypeAliasDeclaration) as ts.TypeAliasDeclaration;
    const type = checker.getTypeAtLocation(alias.name);
    const members = type.isUnion() ? type.types : [type];
    return members.filter(member => member.isStringLiteral()).map(member => (member as ts.StringLiteralType).value);
};

/** Every message type `AppMessageDataMap` declares — replies and pushes alike. */
export const appMessageTypes = (): string[] =>
    literalsOf(`import type { AppMessageDataMap } from '@chatic/app-messages';
export type Probe = keyof AppMessageDataMap;`);

/**
 * The message types no request is answered with — what a shell can only ever send on its own
 * initiative. A reply type a shell also pushes unprompted is not in this list; the shell's
 * inventory catches it from the call site instead.
 */
export const appInitiatedTypes = (): string[] =>
    literalsOf(`import type { AppMessageDataMap, WEB_MESSAGE_RESPONSE_TYPE } from '@chatic/app-messages';
export type Probe = Exclude<keyof AppMessageDataMap, (typeof WEB_MESSAGE_RESPONSE_TYPE)[keyof typeof WEB_MESSAGE_RESPONSE_TYPE]>;`);

// The message as the web receives it: the bridge sends JSON, so a string enum member (react-native-iap's
// `ErrorCode`) arrives as its plain string value. `any` passes through untouched.
const WIRE = `type Wire<T> = 0 extends 1 & T ? T : T extends string ? \`\${T}\` : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;`;

/**
 * What the compiler says about each message, read as `AppMessageData<its type>` after JSON — the
 * envelope (`type`, `success`, `data`) and the payload together, with excess-property checks. Empty
 * when every message conforms. A renamed type, a dropped required field and an extra field all land
 * here — and so does an empty list, so a test whose trigger stopped pushing cannot pass on nothing.
 * A payload declared as `{}` (`OnBackPressed`) has no fields to check, only its envelope.
 */
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
    // Two header lines, then one line per message.
    const { probe, diagnostics } = compile(
        [`import type { AppMessageData } from '@chatic/app-messages';`, WIRE, ...lines].join('\n')
    );
    for (const diagnostic of diagnostics) {
        const index = probe.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line - 2;
        const type = (messages[index] as { type?: string } | undefined)?.type;
        errors.push(type ? `#${index} ${type}: ${message(diagnostic)}` : `probe: ${message(diagnostic)}`);
    }
    return errors;
};

/** The first argument of every call a `pushEvent` mock received. */
export const pushedEvents = (pushEvent: { mock: { calls: unknown[][] } }): unknown[] =>
    pushEvent.mock.calls.map(([pushed]) => pushed);

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)]
    );

/**
 * Every `.pushEvent({ type: '…' })` call under `root`, outside tests, as `type → files` (relative to
 * `root`, sorted). A call whose `type` is not a string literal is filed under `<non-literal>`, so it
 * cannot slip past an inventory that matches on names.
 */
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
                // Through `as`, `satisfies` and parentheses to the literal underneath.
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
