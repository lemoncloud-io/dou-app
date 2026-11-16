'use strict';

const path = require('node:path');
const { RuleTester } = require('eslint');

const rule = require('./runtime-wiring-call');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const at = file => path.join(REPO_ROOT, file);

const options = [
    {
        calls: [
            { name: 'configureSessionStore' },
            { object: 'sessionStores', name: 'configure' },
            { object: 'syncDataGraph', name: 'provide' },
        ],
        allowedFiles: ['libs/runtime-core/src/createRuntime.ts'],
    },
];

const ASSEMBLY = at('libs/runtime-core/src/createRuntime.ts');
const ELSEWHERE = at('apps/web/src/main.tsx');

const outside = call => ({
    messageId: 'outsideAssembly',
    data: { call, allowed: 'libs/runtime-core/src/createRuntime.ts' },
});

new RuleTester({
    languageOptions: { parser: require('@typescript-eslint/parser'), sourceType: 'module' },
}).run('runtime-wiring-call', rule, {
    valid: [
        {
            name: 'the assembly point makes every wiring call',
            filename: ASSEMBLY,
            options,
            code: `
                import { configureSessionStore, sessionStores } from '@chatic/session';
                sessionStores.configure(ports);
                configureSessionStore();
                syncDataGraph.provide(getDataManager);
            `,
        },
        {
            name: 'a method of the same name on another object is not a wiring call',
            filename: ELSEWHERE,
            options,
            code: `config.configure(x); runtimeStores.provide(y); sessionStores.of('plain');`,
        },
        {
            name: 'reading a wiring function without calling it is not a call',
            filename: ELSEWHERE,
            options,
            code: `export { configureSessionStore } from './store/configure';`,
        },
        {
            name: 'a computed member is out of reach',
            filename: ELSEWHERE,
            options,
            code: `sessionStores['configure'](ports);`,
        },
    ],
    invalid: [
        {
            name: 'a function call outside the assembly point',
            filename: ELSEWHERE,
            options,
            code: `configureSessionStore();`,
            errors: [outside('configureSessionStore')],
        },
        {
            name: 'a function imported under another name',
            filename: ELSEWHERE,
            options,
            code: `import { configureSessionStore as boot } from '@chatic/session'; boot();`,
            errors: [outside('configureSessionStore')],
        },
        {
            name: 'a function called through a namespace import',
            filename: ELSEWHERE,
            options,
            code: `import * as session from '@chatic/session'; session.configureSessionStore();`,
            errors: [outside('configureSessionStore')],
        },
        {
            name: 'a method call outside the assembly point',
            filename: ELSEWHERE,
            options,
            code: `sessionStores.configure(ports);`,
            errors: [outside('sessionStores.configure')],
        },
        {
            name: 'a method reached through a longer path',
            filename: ELSEWHERE,
            options,
            code: `runtime.session.sessionStores.configure(ports);`,
            errors: [outside('sessionStores.configure')],
        },
        {
            name: 'a file with the assembly point name in another package',
            filename: at('libs/session/src/init.ts'),
            options,
            code: `syncDataGraph.provide(getDataManager);`,
            errors: [outside('syncDataGraph.provide')],
        },
    ],
});
