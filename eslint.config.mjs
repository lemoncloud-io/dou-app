import nx from '@nx/eslint-plugin';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import hostFactsAllowlist from './tools/eslint-rules/host-facts-allowlist.js';

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

/**
 * The direction the runtime's layers depend in, read from the `nx.tags` in each package's
 * `package.json`. `libs/runtime-core/README.md` draws the layers and says why each edge points the
 * way it does; in short:
 *
 * - `layer:core-lib` — session, transport, sync, auth, data. Platform-neutral. They know nothing
 *   above them: no runtime assembly, no adapter, no React surface, and no UI framework at all.
 * - `layer:foundation` — logger, config, perf, http, storage, bridge-messages: what the core libs
 *   and the assembly are built on. They depend on one another and on nothing else.
 * - `layer:runtime-core` — `@chatic/runtime-core`, which collects the ports and assembles the
 *   runtime from them. It sits on the core libs and the foundation and on nothing else. This is an
 *   allow-list, not a deny-list, so a dependency it gains later has to be tagged on purpose rather
 *   than slipping in untagged.
 * - `layer:adapter` — the packages that fill the ports for one platform (`@chatic/runtime-web`,
 *   `@chatic/runtime-mobile`), and the cache engines they build on (`@chatic/db`: IndexedDB, the
 *   shell's SQLite over the bridge, Web Storage). Nothing in the runtime depends on them; they never reach up into the
 *   React surface, and a port is not UI, so no React either. They do depend on `layer:client`: an
 *   app's declaration (`defineRuntime`, `startRuntime`) lives there, and each adapter package hands
 *   it on beside its own adapters, so an app's entry imports one package. The edge never points the
 *   other way — `layer:client`'s allow-list has no `layer:adapter`.
 * - `layer:client` — `@chatic/runtime-client`, the half of the React surface that calls the core:
 *   the engine holder, the commands and reads through it, and the plain functions the hooks wrap. It
 *   sits on the core libs, runtime-core and the foundation, and no UI framework — an allow-list like
 *   runtime-core's, so what the hooks need from React, react-query or zustand stays in @chatic/runtime.
 * - `layer:react-surface` — `@chatic/runtime`, what apps render against. It never imports an
 *   adapter: which platform fills the ports is the entry point's choice, not the surface's. Reaching
 *   the core through `layer:client` is the direction it is moving in, not a rule: some of its files
 *   still import the core libs directly, and nothing here stops them.
 * - `layer:bridge` — `@chatic/bridges`, the transport across the WebView boundary: the web-side
 *   client, the shell-side host and the `webClient` singleton. The core libs, runtime-core and the
 *   client layer may not depend on it: none of what they hold — the session, the sockets, sync, the
 *   data layer, the assembly — is specific to a WebView, and an import of it would tie them to that
 *   boundary. What a page's bridge answers reaches them through a port its adapter fills, and `logger`,
 *   the one name they used to take from it, is `@chatic/logger`'s. (The message vocabulary,
 *   `@chatic/bridge-messages`, is `layer:foundation`: it carries no transport.)
 * - `layer:ui` — the component libraries and what draws with them: `@chatic/ui-kit`,
 *   `@chatic/web-ui-kit`, `@chatic/block-kit` and `@chatic/theme`. The runtime side — core libs,
 *   runtime-core, the client layer and the adapters — may not depend on one; a UI library is the apps'
 *   and the React surface's to render. `@chatic/shared` is a catch-all of React parts rather than a
 *   layer and carries no tag.
 * - `platform:web` — a package that only runs in a web page. It may not pull React Native in.
 * - `platform:native` — a package that only runs in React Native's JS process
 *   (`@chatic/runtime-mobile`). It may not depend on a `platform:web` package: what is true of a page
 *   is false there, and nothing would say so until a device ran it.
 *
 * `notDependOnLibsWithTags` also follows the target's own dependencies, so a core lib cannot reach
 * an adapter through a lib in between. `onlyDependOnLibsWithTags` checks direct dependencies only.
 */
const REACT_IMPORTS = ['react', 'react/*', 'react-dom', 'react-dom/*'];
const REACT_NATIVE_IMPORTS = ['react-native', 'react-native-*', '@react-native*'];
const UI_FRAMEWORK_IMPORTS = [...REACT_IMPORTS, ...REACT_NATIVE_IMPORTS];

const runtimeLayerConstraints = [
    {
        sourceTag: 'layer:core-lib',
        notDependOnLibsWithTags: [
            'layer:runtime-core',
            'layer:client',
            'layer:adapter',
            'layer:react-surface',
            'layer:bridge',
            'layer:ui',
        ],
        bannedExternalImports: UI_FRAMEWORK_IMPORTS,
    },
    {
        // An allow-list too: runtime-core's own allow-list checks its direct dependencies only, so a
        // foundation package that took an untagged one would carry it into the assembly unseen.
        sourceTag: 'layer:foundation',
        onlyDependOnLibsWithTags: ['layer:foundation'],
    },
    {
        sourceTag: 'layer:runtime-core',
        onlyDependOnLibsWithTags: ['layer:core-lib', 'layer:foundation'],
        // Already outside the allow-list; named so the ban survives a change to it, and because this
        // one also follows the dependencies of what the allow-list lets in.
        notDependOnLibsWithTags: ['layer:bridge', 'layer:ui'],
        bannedExternalImports: UI_FRAMEWORK_IMPORTS,
    },
    {
        // React, react-query and zustand are what @chatic/runtime keeps; this layer is the part of the
        // surface that would work unchanged under another UI library.
        sourceTag: 'layer:client',
        onlyDependOnLibsWithTags: ['layer:core-lib', 'layer:runtime-core', 'layer:foundation'],
        notDependOnLibsWithTags: ['layer:bridge', 'layer:ui'],
        bannedExternalImports: [...UI_FRAMEWORK_IMPORTS, '@tanstack/*', 'zustand', 'zustand/*'],
    },
    {
        sourceTag: 'layer:adapter',
        // `layer:client` is within reach on purpose (the declaration API), and so is `layer:bridge`: a
        // page's ports are read across it. The React surface and the UI libraries are not.
        notDependOnLibsWithTags: ['layer:react-surface', 'layer:ui'],
        // React only: the native adapter is made of React Native modules, so which native framework
        // an adapter may use is its platform tag's call, not this layer's.
        bannedExternalImports: REACT_IMPORTS,
    },
    {
        sourceTag: 'layer:react-surface',
        notDependOnLibsWithTags: ['layer:adapter'],
    },
    {
        sourceTag: 'platform:web',
        bannedExternalImports: REACT_NATIVE_IMPORTS,
    },
    {
        sourceTag: 'platform:native',
        notDependOnLibsWithTags: ['platform:web'],
    },
];

/**
 * The calls that wire the runtime together, and the one file allowed to make them. Each hands a
 * package what it runs on and replaces whatever it held before. Not here: what an app sets up for
 * itself before the runtime (`configurePerfTraces`, `setStorageAdapter`, `setLogContextProvider`)
 * and the reaction an app registers through `runtime.session` — those are the app's own choices.
 */
const RUNTIME_WIRING = {
    calls: [
        { object: 'sessionStores', name: 'configure' },
        { object: 'runtimeStores', name: 'configure' },
        { object: 'signedOutAppKeys', name: 'register' },
        { name: 'configureSessionStore' },
        { object: 'credentialRecovery', name: 'register' },
        { object: 'transportPlatform', name: 'configure' },
        { object: 'authPlatform', name: 'configure' },
        { object: 'localCachePlatform', name: 'configure' },
        { object: 'foregroundPlatform', name: 'configure' },
        { name: 'configureDataRuntime' },
        { object: 'authRepositorySource', name: 'provide' },
        { object: 'syncDataGraph', name: 'provide' },
    ],
    allowedFiles: ['libs/runtime-core/src/createRuntime.ts'],
};

/**
 * The packages closed to everything but the runtime modules, and the inner paths closed to everything —
 * the shared block of `@typescript-eslint/no-restricted-imports` below says why. Held here because a
 * block that sets the rule again for narrower files (the app block) replaces these lists and has to
 * carry them.
 */
const CLOSED_PATHS = [
    {
        name: '@chatic/session',
        message:
            'Read the session through `runtime.session` from @chatic/runtime. @chatic/session is for the runtime modules — see libs/session/README.md.',
    },
    {
        name: '@chatic/auth',
        message:
            'Use the session through `runtime.session` from @chatic/runtime. @chatic/auth is for the runtime modules — see libs/auth/README.md.',
    },
    {
        name: '@chatic/sync',
        message:
            'Register sync through `runtime.sync` from @chatic/runtime. @chatic/sync is for the runtime modules — see libs/sync/README.md.',
    },
    {
        name: '@chatic/transport',
        message:
            'Reach sockets and HTTP through `runtime` from @chatic/runtime. @chatic/transport is for the runtime modules — see libs/transport/README.md.',
    },
    {
        name: '@chatic/runtime-client',
        message:
            'Read the runtime through `runtime` from @chatic/runtime. @chatic/runtime-client is the core side @chatic/runtime is built on — see libs/runtime-client/README.md.',
    },
    {
        name: '@chatic/runtime-core',
        message:
            'Declare the runtime in the app src/config/ and start it with `startRuntime` from @chatic/runtime-web (a page) or @chatic/runtime-mobile (React Native), and read it through `runtime` from @chatic/runtime. @chatic/runtime-core is the assembly — see libs/runtime-core/README.md.',
    },
];

const CLOSED_PATTERNS = [
    {
        group: ['@chatic/data/*'],
        message: 'Import from the `@chatic/data` barrel. Paths inside it are closed — see libs/data/README.md.',
    },
    {
        group: ['@chatic/runtime-client/*'],
        message:
            'Read the runtime through `runtime` from @chatic/runtime. @chatic/runtime-client is the core side @chatic/runtime is built on — see libs/runtime-client/README.md.',
    },
    {
        group: ['@chatic/session/*'],
        message:
            'Read the session through `runtime.session` from @chatic/runtime. @chatic/session is for the runtime modules — see libs/session/README.md.',
    },
    {
        group: ['@chatic/auth/*'],
        message:
            'Use the session through `runtime.session` from @chatic/runtime. @chatic/auth is for the runtime modules — see libs/auth/README.md.',
    },
    {
        group: ['@chatic/sync/*'],
        message:
            'Register sync through `runtime.sync` from @chatic/runtime. @chatic/sync is for the runtime modules — see libs/sync/README.md.',
    },
    {
        group: ['@chatic/transport/*'],
        message:
            'Reach sockets and HTTP through `runtime` from @chatic/runtime. @chatic/transport is for the runtime modules — see libs/transport/README.md.',
    },
    {
        group: ['@chatic/runtime-core/*'],
        message:
            'Declare the runtime in the app src/config/ and start it with `startRuntime` from @chatic/runtime-web (a page) or @chatic/runtime-mobile (React Native), and read it through `runtime` from @chatic/runtime. @chatic/runtime-core is the assembly — see libs/runtime-core/README.md.',
    },
];

const SETTINGS_MESSAGE =
    "Read and write settings through `runtime.settings` from @chatic/runtime. @chatic/config is wired in the app's src/config/ and main.tsx.";
const DATA_MESSAGE =
    "Reach the data layer through `runtime` from @chatic/runtime (its repositories, hooks and `runtime.<port>`). @chatic/data is named only in the app's src/config/.";
const ADAPTER_MESSAGE =
    "Import the runtime from @chatic/runtime. Which adapter fills a port is the app's declaration's choice, in src/config/, started from main.tsx.";
const DB_MESSAGE =
    "The cache engine is the app's declaration's choice, in src/config/. Read the cache through `runtime` from @chatic/runtime.";
const HOST_MESSAGE = 'Read the host ports as `runtime.<port>` from @chatic/runtime; @chatic/host is gone.';

/**
 * What an app's call part may not import: everything it needs from the runtime arrives through
 * `@chatic/runtime` (`runtime`, `runtime.settings`, `runtime.<port>`), and the packages that build the
 * runtime are named only where the app chooses them — its declaration in `src/config/` and its entry,
 * `src/main.tsx`. The shared lists are carried too (see `CLOSED_PATHS`); `@chatic/data/*` gets this
 * block's message, because the barrel is closed here as well.
 */
const APP_CALL_PART_PATHS = [
    ...CLOSED_PATHS,
    { name: '@chatic/host', message: HOST_MESSAGE },
    { name: '@chatic/config', message: SETTINGS_MESSAGE },
    { name: '@chatic/data', message: DATA_MESSAGE },
    { name: '@chatic/runtime-web', message: ADAPTER_MESSAGE },
    { name: '@chatic/runtime-mobile', message: ADAPTER_MESSAGE },
    { name: '@chatic/db', message: DB_MESSAGE },
];

const APP_CALL_PART_PATTERNS = [
    ...CLOSED_PATTERNS.filter(pattern => !pattern.group.includes('@chatic/data/*')),
    { group: ['@chatic/host/*'], message: HOST_MESSAGE },
    { group: ['@chatic/config/*'], message: SETTINGS_MESSAGE },
    { group: ['@chatic/data/*'], message: DATA_MESSAGE },
    { group: ['@chatic/runtime-web/*', '@chatic/runtime-mobile/*'], message: ADAPTER_MESSAGE },
    { group: ['@chatic/db/*'], message: DB_MESSAGE },
];

const STORAGE_MESSAGE =
    "Reach web storage through a store from @chatic/storage — take the one your app's `app/storage` hands out (`deviceStore`, `tabStore`, …); see libs/storage/README.md.";

// Web storage is reached only through `@chatic/storage`'s stores: a domain declares the store it
// needs and the entry point (`resolveStorageStores`) chooses it, so no other code may name
// `localStorage`/`sessionStorage` itself — and zustand's `persist`, which falls back to
// `localStorage` when given no storage, must name one. It covers every app and every lib; an app that
// only runs in a browser builds its stores once in its own `app/storage`. Tests seed web storage
// directly and are left out, and so are the e2e suites and the shell adapter, which stand outside the
// app and play the browser or the native shell around it.
const WEB_STORAGE_BAN_SCOPE = {
    basePath: REPO_ROOT,
    files: ['apps/*/src/**/*.ts', 'apps/*/src/**/*.tsx', 'libs/**/*.ts', 'libs/**/*.tsx'],
    ignores: [
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/testing/**',
        'apps/*-e2e/**',
        'apps/shell-adapter/**',
        'libs/storage/**',
        'libs/chatic-apps-sdk/**',
    ],
};

const STORAGE_GLOBALS = [
    { name: 'localStorage', message: STORAGE_MESSAGE },
    { name: 'sessionStorage', message: STORAGE_MESSAGE },
];

/**
 * The core packages — session, transport, sync, auth, data — run in the native process as well as in a
 * page, so none of them may read a page's globals: what the platform answers comes in through a port
 * the platform's adapter fills (`@chatic/runtime-web` in a page, `@chatic/runtime-mobile` in the native
 * process). Four of them also compile without the DOM's types; `@chatic/data` still declares its
 * IndexedDB port in IndexedDB's own types, so for it this list is the only check. Listed by name, because `no-restricted-globals` has no "everything
 * a page has"; these are the ones a runtime is tempted by.
 */
const CORE_LIB_SOURCES = ['session', 'transport', 'sync', 'auth', 'data'].map(name => `libs/${name}/src/**/*.ts`);

const PAGE_GLOBAL_MESSAGE =
    'The core packages run outside a page too. Take what the platform answers through a port its adapter fills — see libs/runtime-core/README.md.';

const PAGE_GLOBALS = [
    'window',
    'self',
    'document',
    'navigator',
    'location',
    'history',
    'indexedDB',
    'WebSocket',
    'XMLHttpRequest',
    'alert',
    'confirm',
].map(name => ({ name, message: PAGE_GLOBAL_MESSAGE }));

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
        "Give zustand's `persist` a `storage` — left out, it writes `localStorage` directly. Use `persistStorageOver(deviceStore)` from your app's `app/storage`.",
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
                    // Vitest specs load the runtime fake with `await import('@chatic/runtime/testing')`
                    // inside `vi.mock`, because a hoisted factory cannot use a static import. The rule
                    // reads that as `@chatic/runtime` being lazy-loaded and then flags every static
                    // import of the facade in the app. No app loads the facade lazily.
                    checkDynamicDependenciesExceptions: ['@chatic/runtime'],
                    depConstraints: [
                        {
                            sourceTag: '*',
                            onlyDependOnLibsWithTags: ['*'],
                        },
                        ...runtimeLayerConstraints,
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
        // everything but the runtime modules cut from @chatic/runtime. The session barrel sells the raw
        // stores, because the use cases write them; the transport barrel sells the socket manager and
        // the HTTP gateways; the sync barrel sells the manager and the refusal writers; the auth barrel
        // sells the session writers and the renewers. An app that imported one could go around the use
        // cases built on them. Apps read all four through `runtime`. A lib config that extends this
        // one and may import one of the packages — transport, sync, auth, @chatic/runtime, and the two
        // adapters runtime-web and runtime-mobile — sets the rule again for its own files.
        //
        // No package is exempt here, `libs/data` and `libs/session` included: each passes the whole
        // list, its own name among it. An `ignores` for either would open more than its own name —
        // `@chatic/session`, `auth`, `sync` and `transport` to `libs/data`, the data barrel's inner
        // paths to `libs/session` — so a package that needs an opening writes it in its own config.
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            '@typescript-eslint/no-restricted-imports': ['error', { paths: CLOSED_PATHS, patterns: CLOSED_PATTERNS }],
        },
    },
    {
        // An app's call part reaches the runtime through @chatic/runtime alone — the lists say what and
        // why. The declaration and the entry that starts it are the exceptions, and so is the one test
        // helper that seeds settings for the tests (`apps/web/src/testing/settings.ts`). Tests that only
        // `jest.mock` one of these packages need no exception: a mock is not an import.
        basePath: REPO_ROOT,
        files: [
            'apps/{web,desktop-web,admin,landing}/src/**/*.ts',
            'apps/{web,desktop-web,admin,landing}/src/**/*.tsx',
        ],
        ignores: ['apps/*/src/config/**', 'apps/*/src/main.tsx', 'apps/web/src/testing/settings.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                { paths: APP_CALL_PART_PATHS, patterns: APP_CALL_PART_PATTERNS },
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
        files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
        rules: {
            '@nx/workspace-ratchet': 'error',
        },
    },
    {
        // The runtime's wiring calls are made in one file, the assembly point; the rule says why.
        // Every glob starts with `**/`, so no `basePath`. Tests wire packages up on purpose and are
        // left out.
        files: ['**/*.ts', '**/*.tsx'],
        ignores: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx', '**/testing/**', '**/__mocks__/**'],
        rules: {
            // tools/eslint-rules/runtime-wiring-call.js
            '@nx/workspace-runtime-wiring-call': ['error', RUNTIME_WIRING],
        },
    },
    {
        // Asking the host what it is — `isNative()`, a `CHATIC_APP_*` global — belongs to
        // `@chatic/bridges`; features reach the host through the ports the app's runtime declaration
        // publishes (`runtime.<port>`). The rule
        // says why; the allow-list (tools/eslint-rules/host-facts-allowlist.js) starts with every file
        // that did it and shrinks as each domain moves onto its port. Tests and fakes play the host on
        // purpose and are left out. The shells only write the globals, which the rule does not report.
        files: ['**/*.ts', '**/*.tsx'],
        ignores: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx', '**/testing/**', '**/__mocks__/**'],
        rules: {
            // tools/eslint-rules/host-facts.js
            '@nx/workspace-host-facts': ['error', { allowedFiles: hostFactsAllowlist }],
        },
    },
    {
        // A feature calls a host port's members; it does not ask which side (`kind`) does the work. The
        // declaration part (`src/config/`) builds the ports and may read it; tests play a host. Every
        // port with a choice is listed (checkout's `kind` names its method, not a side).
        files: ['**/*.ts', '**/*.tsx'],
        ignores: [
            '**/*.spec.ts',
            '**/*.spec.tsx',
            '**/*.test.ts',
            '**/*.test.tsx',
            '**/testing/**',
            '**/__mocks__/**',
            'apps/*/src/config/**',
        ],
        rules: {
            // tools/eslint-rules/host-port-kind.js
            '@nx/workspace-host-port-kind': [
                'error',
                { ports: ['media', 'files', 'links', 'appShell', 'signIn', 'diagnostics', 'push'] },
            ],
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
        // Page globals in the core packages — see `PAGE_GLOBALS`. After the web-storage ban and carrying
        // its list too: a later block that sets the same rule replaces its options for these files.
        basePath: REPO_ROOT,
        files: CORE_LIB_SOURCES,
        ignores: WEB_STORAGE_BAN_SCOPE.ignores,
        rules: {
            'no-restricted-globals': ['error', ...STORAGE_GLOBALS, ...PAGE_GLOBALS],
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
