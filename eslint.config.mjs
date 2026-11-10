import nx from '@nx/eslint-plugin';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The log areas, read out of `@chatic/logger`'s own list so this file never holds a second copy.
 * A config cannot import TypeScript, so the array literal is read as text; if that ever finds
 * nothing, loading the config fails rather than letting every tag through unchecked.
 */
const LOG_AREAS = (() => {
    const source = readFileSync(new URL('./libs/logger/src/core/areas.ts', import.meta.url), 'utf8');
    const body = source.match(/export const LOG_AREAS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
    const areas = [...body.matchAll(/'([a-z0-9_]+)'/g)].map(match => match[1]);
    if (!areas.length) throw new Error('eslint.config.mjs: no LOG_AREAS found in libs/logger/src/core/areas.ts');
    return new Set(areas);
})();

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

/**
 * Keeps a package off `@chatic/bridges`. The configs of session, transport, sync, auth and data
 * add `noBridgesImport` to their own list.
 *
 * Those five hold the session, the sockets, sync and the data layer, and none of that is specific to
 * a WebView. `@chatic/bridges` is the transport across the WebView boundary — the web-side client,
 * the shell-side host and the `webClient` singleton — so an import of it ties the package to that
 * boundary. Nothing they need lives there: `logger`, the one name they still took from it, is only
 * re-exported from `@chatic/logger`.
 *
 * `noBridgesImport` belongs in a package's own config and does nothing in this file's list. Its
 * globs carry no package path, and a flat config resolves them against the directory lint runs in,
 * which for a project's lint target is that project.
 *
 * This is the core `no-restricted-imports`, not the `@typescript-eslint` one the bans around it use,
 * and that is deliberate: a flat config replaces a rule's options when a later block sets the rule
 * again, so a second rule name is what lets this ban sit on top of a package's existing list rather
 * than having to be copied into every copy of it. A block that sets the core rule for a narrower
 * set of files has to carry `bridgesImportPattern` itself, for the same reason.
 *
 * It reads static imports and re-exports, type-only ones included, in every TypeScript file of the
 * package — its jest setup as well as `src/`. A dynamic `import()` is not covered, and neither is
 * `jest.mock('@chatic/bridges')`, so a test can still stub the package for a module that reaches it
 * indirectly.
 */
export const bridgesImportPattern = {
    group: ['@chatic/bridges', '@chatic/bridges/*'],
    message:
        'This package stays off the WebView bridge. Import `logger` from @chatic/logger; anything bridge-specific has to arrive through a port its owner fills.',
};

export const noBridgesImport = {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
        'no-restricted-imports': ['error', { patterns: [bridgesImportPattern] }],
    },
};

/**
 * Warns about a tag the trigger catalogue does not have: a tag is one event, `<area>.<event>`.
 *
 * A warning, not an error — call sites move to event tags one area at a time, and until they do the
 * old area-only tags (`SOCKET`) are expected. Reads only a string literal as `logger.<level>`'s first
 * argument; a tag held in a variable is not checked.
 *
 * Options: `events` — the catalogue's event tags. While it is empty only the area is checked, which
 * is the state until the catalogue's event names are settled.
 */
const logTagCatalogRule = {
    meta: {
        type: 'suggestion',
        schema: [
            {
                type: 'object',
                properties: { events: { type: 'array', items: { type: 'string' } } },
                additionalProperties: false,
            },
        ],
        messages: {
            legacyTag: "'{{tag}}' is an area-only tag. Use an event tag '<area>.<event>' from the trigger catalogue.",
            unknownArea: "'{{tag}}' is in area '{{area}}', which the trigger catalogue does not have.",
            unknownEvent: "'{{tag}}' is not an event the trigger catalogue lists.",
        },
    },
    create(context) {
        const events = new Set(context.options[0]?.events ?? []);
        return {
            CallExpression(node) {
                const { callee } = node;
                if (callee.type !== 'MemberExpression' || callee.computed) return;
                if (callee.object.type !== 'Identifier' || callee.object.name !== 'logger') return;
                if (callee.property.type !== 'Identifier' || !LOG_LEVELS.has(callee.property.name)) return;

                const first = node.arguments[0];
                let tag;
                if (first?.type === 'Literal' && typeof first.value === 'string') tag = first.value;
                else if (first?.type === 'TemplateLiteral' && first.expressions.length === 0)
                    tag = first.quasis[0].value.cooked;
                if (!tag) return;

                const dot = tag.indexOf('.');
                const area = dot > 0 ? tag.slice(0, dot) : tag.toLowerCase();
                if (!LOG_AREAS.has(area)) {
                    context.report({ node: first, messageId: 'unknownArea', data: { tag, area } });
                } else if (dot <= 0) {
                    context.report({ node: first, messageId: 'legacyTag', data: { tag } });
                } else if (events.size && !events.has(tag)) {
                    context.report({ node: first, messageId: 'unknownEvent', data: { tag } });
                }
            },
        };
    },
};

// ---------------------------------------------------------------------------------------------------
// Two ways a block in this file goes quiet without an error. Read both before adding one.
//
// 1. A glob that names a repo path needs `basePath: REPO_ROOT`.
//
//    ESLint resolves a block's `files` and `ignores` against the directory of the config file it
//    loaded — not of the file the block is written in. Lint runs per project: the `lint` target is
//    `eslint .` with the project as its working directory, in CI and in the commit hook alike. A
//    project with no config of its own loads this file, and `libs/**` means what it says. A project
//    with its own `eslint.config.mjs` spreads this array into that file, and there the same glob is
//    read as `libs/<name>/libs/**`: the block reaches no file, and an `ignores` written that way
//    exempts none. `basePath` pins a block's globs to a directory wherever the array ends up, so
//    every block below that names `apps/…` or `libs/…` carries it. A block whose globs all start
//    with `**/` needs nothing.
//
// 2. Two restrictions under one rule name have to share one options list.
//
//    A later block that gives a rule options for a file replaces the earlier ones; it does not add
//    to them. `no-restricted-globals`, `-properties` and `-syntax` each hold several unrelated bans, so
//    a second block naming one of them for an overlapping set of files switches the first ban off
//    there. Write both lists into the later block — the desktop-web block at the end of this file
//    does, and so does `webStorageBanAfterReact` for nx's `flat/react` preset, which sets all three.
//
// Either way, check a new block where lint really runs — from a project that has its own config:
//
//     cd libs/data && npx eslint --print-config src/index.ts
// ---------------------------------------------------------------------------------------------------
const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));

const STORAGE_MESSAGE =
    'Reach web storage through a medium from @chatic/storage (in apps/web and apps/desktop-web: `deviceMedium`/`tabMedium` from `app/storage`) — see libs/storage/README.md.';

// Web storage is reached only through `@chatic/storage`'s media: a domain declares the medium it
// needs and the entry point (`resolveStorageMedia`) chooses it, so no other code may name
// `localStorage`/`sessionStorage` itself — and zustand's `persist`, which falls back to
// `localStorage` when given no storage, must name one. It covers the apps that run in a shell —
// apps/web and apps/desktop-web — and every lib; the browser-only apps (admin, landing,
// block-kit-builder) are outside it. Tests seed web storage directly and are left out.
const WEB_STORAGE_BAN_SCOPE = {
    basePath: REPO_ROOT,
    files: [
        'apps/web/src/**/*.ts',
        'apps/web/src/**/*.tsx',
        'apps/desktop-web/src/**/*.ts',
        'apps/desktop-web/src/**/*.tsx',
        'libs/**/*.ts',
        'libs/**/*.tsx',
    ],
    ignores: [
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/testing/**',
        'libs/storage/**',
        'libs/chatic-apps-sdk/**',
    ],
};

const STORAGE_GLOBALS = [
    { name: 'localStorage', message: STORAGE_MESSAGE },
    { name: 'sessionStorage', message: STORAGE_MESSAGE },
];

const STORAGE_PROPERTIES = [
    { object: 'window', property: 'localStorage', message: STORAGE_MESSAGE },
    { object: 'window', property: 'sessionStorage', message: STORAGE_MESSAGE },
    { object: 'globalThis', property: 'localStorage', message: STORAGE_MESSAGE },
    { object: 'globalThis', property: 'sessionStorage', message: STORAGE_MESSAGE },
];

const PERSIST_WITHOUT_STORAGE = {
    selector:
        "CallExpression[callee.name='persist'][arguments.length>=2] > ObjectExpression:last-child:not(:has(Property[key.name='storage']))",
    message:
        "Give zustand's `persist` a `storage` — left out, it writes `localStorage` directly. In apps/web and apps/desktop-web: `persistStorageOver(deviceMedium)` from `app/storage`.",
};

// Native `title` tooltips wait on the browser (a second or more, restarting on every mouse move) and
// ignore the app's TooltipProvider — desktop-web hints go through `Hint`.
const NATIVE_TITLE_TOOLTIP = {
    selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
    message: 'Use `Hint` (apps/desktop-web shared/components) instead of a native `title` tooltip.',
};

/** What nx's `flat/react` preset lists under one of the `no-restricted-*` rules, severity left off. */
const reactPresetRestrictions = rule => {
    const entry = nx.configs['flat/react'].findLast(config => config.rules?.[rule])?.rules[rule];
    return Array.isArray(entry) ? entry.slice(1) : [];
};

/**
 * The web-storage ban for a lib whose config spreads nx's `flat/react` preset after this array.
 *
 * The preset sets the same three rules the ban uses (confusing browser globals, `require.ensure`,
 * `with`), and coming later it replaces the ban's lists with its own. This block holds both, so a
 * lib that adds it after the preset keeps the preset's restrictions and gets the ban back. One list
 * has one severity, so the preset's `with` warning is an error in these files. Its scope is the
 * ban's own, so it does nothing in a project the ban leaves out.
 */
export const webStorageBanAfterReact = {
    ...WEB_STORAGE_BAN_SCOPE,
    rules: {
        'no-restricted-globals': ['error', ...reactPresetRestrictions('no-restricted-globals'), ...STORAGE_GLOBALS],
        'no-restricted-properties': [
            'error',
            ...reactPresetRestrictions('no-restricted-properties'),
            ...STORAGE_PROPERTIES,
        ],
        'no-restricted-syntax': ['error', ...reactPresetRestrictions('no-restricted-syntax'), PERSIST_WITHOUT_STORAGE],
    },
};

export default [
    ...nx.configs['flat/base'],
    ...nx.configs['flat/typescript'],
    ...nx.configs['flat/javascript'],
    {
        basePath: REPO_ROOT,
        ignores: ['**/dist', '**/out-tsc', 'apps/desktop/out', '**/vite.config.*.timestamp*', '**/public'],
    },
    {
        plugins: {
            import: importPlugin,
            'unused-imports': unusedImports,
            'react-hooks': reactHooks,
        },
    },
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        rules: {
            '@nx/enforce-module-boundaries': [
                'error',
                {
                    enforceBuildableLibDependency: true,
                    allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
                    depConstraints: [
                        {
                            sourceTag: '*',
                            onlyDependOnLibsWithTags: ['*'],
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
        rules: {
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-empty-interface': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-unused-vars': 'off',
            curly: ['error', 'multi-line'],
            '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'unused-imports/no-unused-imports': 'error',
            'unused-imports/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                },
            ],
        },
    },
    {
        // `@chatic/data` is a headless data layer whose whole safety story is that apps see the
        // barrel and nothing else — that is what lets the lib be rearranged with no blast radius
        // outside it. The invariant used to be a grep in the lib README; this is the same check,
        // run on every lint. It holds inside `libs/data` too, where relative paths are how the
        // layers talk.
        //
        // `@chatic/session`, `@chatic/transport`, `@chatic/sync` and `@chatic/auth` are closed to
        // everything but the runtime modules cut from app-runtime. The session barrel sells the raw
        // stores, because the use cases write them; the transport barrel sells the socket manager and
        // the HTTP gateways; the sync barrel sells the manager and the refusal writers; the auth barrel
        // sells the session writers and the renewers. An app that imported one could go around the use
        // cases built on them. Apps read all four through `runtime`. A lib config that extends this
        // one and may import one of the packages — transport, sync, auth, app-runtime — sets the rule
        // again for its own files.
        //
        // No package is exempt here, `libs/data` and `libs/session` included: each passes the whole
        // list, its own name among it. An `ignores` for either would open more than its own name —
        // `@chatic/session`, `auth`, `sync` and `transport` to `libs/data`, the data barrel's inner
        // paths to `libs/session` — so a package that needs an opening writes it in its own config.
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@chatic/session',
                            message:
                                'Read the session through `runtime.session` from @chatic/app-runtime. @chatic/session is for the runtime modules — see libs/session/README.md.',
                        },
                        {
                            name: '@chatic/auth',
                            message:
                                'Use the session through `runtime.session` from @chatic/app-runtime. @chatic/auth is for the runtime modules — see libs/auth/README.md.',
                        },
                        {
                            name: '@chatic/sync',
                            message:
                                'Register sync through `runtime.sync` from @chatic/app-runtime. @chatic/sync is for the runtime modules — see libs/sync/README.md.',
                        },
                        {
                            name: '@chatic/transport',
                            message:
                                'Reach sockets and HTTP through `runtime` from @chatic/app-runtime. @chatic/transport is for the runtime modules — see libs/transport/README.md.',
                        },
                    ],
                    patterns: [
                        {
                            group: ['@chatic/data/*'],
                            message:
                                'Import from the `@chatic/data` barrel. Paths inside it are closed — see libs/data/README.md.',
                        },
                        {
                            group: ['@chatic/session/*'],
                            message:
                                'Read the session through `runtime.session` from @chatic/app-runtime. @chatic/session is for the runtime modules — see libs/session/README.md.',
                        },
                        {
                            group: ['@chatic/auth/*'],
                            message:
                                'Use the session through `runtime.session` from @chatic/app-runtime. @chatic/auth is for the runtime modules — see libs/auth/README.md.',
                        },
                        {
                            group: ['@chatic/sync/*'],
                            message:
                                'Register sync through `runtime.sync` from @chatic/app-runtime. @chatic/sync is for the runtime modules — see libs/sync/README.md.',
                        },
                        {
                            group: ['@chatic/transport/*'],
                            message:
                                'Reach sockets and HTTP through `runtime` from @chatic/app-runtime. @chatic/transport is for the runtime modules — see libs/transport/README.md.',
                        },
                    ],
                },
            ],
        },
    },
    {
        // Log tags against the trigger catalogue. Warnings only (see the rule). Tests are left out —
        // their tags are fixtures — and so are the two desktop apps, which are outside this round of
        // tag changes.
        basePath: REPO_ROOT,
        files: ['apps/**/*.ts', 'apps/**/*.tsx', 'libs/**/*.ts', 'libs/**/*.tsx'],
        ignores: [
            '**/*.spec.ts',
            '**/*.spec.tsx',
            '**/*.test.ts',
            '**/*.test.tsx',
            'apps/desktop/**',
            'apps/desktop-web/**',
        ],
        plugins: { 'dou-logging': { rules: { 'log-tag-catalog': logTagCatalogRule } } },
        rules: {
            'dou-logging/log-tag-catalog': 'warn',
        },
    },
    {
        // The web-storage ban — its reasons and its scope are at `WEB_STORAGE_BAN_SCOPE` above.
        ...WEB_STORAGE_BAN_SCOPE,
        rules: {
            'no-restricted-globals': ['error', ...STORAGE_GLOBALS],
            'no-restricted-properties': ['error', ...STORAGE_PROPERTIES],
            'no-restricted-syntax': ['error', PERSIST_WITHOUT_STORAGE],
        },
    },
    {
        // No native `title` tooltip in desktop-web — every .tsx file, tests included.
        basePath: REPO_ROOT,
        files: ['apps/desktop-web/src/**/*.tsx'],
        rules: {
            'no-restricted-syntax': ['error', NATIVE_TITLE_TOOLTIP],
        },
    },
    {
        // The block above sets `no-restricted-syntax` for files the web-storage ban covers too, which
        // takes the ban's `persist` check off them. This one puts both back on those files.
        basePath: REPO_ROOT,
        files: ['apps/desktop-web/src/**/*.tsx'],
        ignores: WEB_STORAGE_BAN_SCOPE.ignores,
        rules: {
            'no-restricted-syntax': ['error', PERSIST_WITHOUT_STORAGE, NATIVE_TITLE_TOOLTIP],
        },
    },
];
