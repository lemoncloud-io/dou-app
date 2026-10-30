import nx from '@nx/eslint-plugin';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import { readFileSync } from 'node:fs';

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

export default [
    ...nx.configs['flat/base'],
    ...nx.configs['flat/typescript'],
    ...nx.configs['flat/javascript'],
    {
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
        // run on every lint. `libs/data` itself is exempt: inside the lib, relative paths are how
        // the layers talk.
        //
        // `@chatic/session`, `@chatic/transport` and `@chatic/sync` are closed to everything but the
        // runtime modules cut from app-runtime. The session barrel sells the raw stores, because the
        // use cases in app-runtime write them; the transport barrel sells the socket manager and the
        // HTTP gateways; the sync barrel sells the manager and the refusal writers. An app that
        // imported one could go around the use cases built on them. Apps read all three through
        // `runtime`. A lib config that extends this one and may import one of the packages —
        // transport, sync, app-runtime — sets the rule again for its own files.
        files: ['**/*.ts', '**/*.tsx'],
        ignores: ['libs/data/**', 'libs/session/**'],
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
        // Native `title` tooltips wait on the browser (a second or more, restarting on every
        // mouse move) and ignore the app's TooltipProvider — desktop-web hints go through `Hint`.
        files: ['apps/desktop-web/src/**/*.tsx'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
                    message: 'Use `Hint` (apps/desktop-web shared/components) instead of a native `title` tooltip.',
                },
            ],
        },
    },
];
