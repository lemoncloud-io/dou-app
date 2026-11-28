'use strict';

const path = require('node:path');
const { RuleTester } = require('eslint');
const tsParser = require('@typescript-eslint/parser');

const rule = require('./host-facts');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const at = file => path.join(REPO_ROOT, file);

const options = [{ allowedFiles: ['libs/bridge/client/', 'apps/web/src/config/webRuntime.ts'] }];
const FEATURE = at('apps/web/src/app/features/subscription/hooks/usePlanCatalog.ts');

const global = name => ({ messageId: 'global', data: { name } });
const probe = name => ({ messageId: 'probe', data: { name } });

new RuleTester({
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
}).run('host-facts', rule, {
    valid: [
        // A listed file and the profile's own package may ask.
        {
            code: "import { isNative } from '@chatic/bridges'; isNative(); window.CHATIC_APP_PLATFORM;",
            filename: at('apps/web/src/config/webRuntime.ts'),
            options,
        },
        {
            code: 'export const isNative = () => !!window.ReactNativeWebView; window.CHATIC_APP_STAGE;',
            filename: at('libs/bridge/client/src/common/utils.ts'),
            options,
        },
        // Reading the host profile is the sanctioned way, and is not a read off the global object.
        { code: 'hostProfile().globals.CHATIC_APP_PLATFORM;', filename: FEATURE, options },
        // Writing a global is what a host does, not a question about it.
        { code: "window.CHATIC_APP_PLATFORM = 'ios';", filename: FEATURE, options },
        { code: 'delete window.CHATIC_APP_PLATFORM;', filename: FEATURE, options },
        // Another package's isNative, or another global, is not this rule's business.
        { code: "import { isNative } from './local'; isNative();", filename: FEATURE, options },
        { code: 'window.ENV; window.ReactNativeWebView;', filename: FEATURE, options },
        // Declaring the probe, or a property that happens to share its name in a type, is not a use.
        { code: 'export const isNativeApp = (): boolean => false;', filename: FEATURE, options },
        { code: 'interface Boot { isNativeApp(): boolean }', filename: FEATURE, options },
        // A type declaration is not a read.
        { code: 'declare global { interface Window { CHATIC_APP_PLATFORM?: string } }', filename: FEATURE, options },
    ],
    invalid: [
        {
            code: "import { isNative } from '@chatic/bridges'; if (isNative()) {}",
            filename: FEATURE,
            options,
            errors: [probe('isNative()')],
        },
        {
            code: "import { isNative as inShell } from '@chatic/bridges'; inShell();",
            filename: FEATURE,
            options,
            errors: [probe('isNative()')],
        },
        {
            code: "import { isNative } from '@chatic/bridge-client'; isNative();",
            filename: FEATURE,
            options,
            errors: [probe('isNative()')],
        },
        {
            code: "import * as bridges from '@chatic/bridges'; bridges.isNative();",
            filename: FEATURE,
            options,
            errors: [probe('isNative()')],
        },
        {
            code: "const ios = window.CHATIC_APP_PLATFORM === 'ios';",
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_PLATFORM')],
        },
        {
            code: 'const p = (window as unknown as { CHATIC_APP_PLATFORM?: string }).CHATIC_APP_PLATFORM;',
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_PLATFORM')],
        },
        {
            code: "const p = window?.CHATIC_APP_PLATFORM?.toLowerCase(); const s = globalThis['CHATIC_APP_STAGE'];",
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_PLATFORM'), global('CHATIC_APP_STAGE')],
        },
        {
            code: 'const { CHATIC_APP_PLATFORM: platform, ENV } = window;',
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_PLATFORM')],
        },
        {
            code: "const has = 'CHATIC_APP_RUNTIME' in window;",
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_RUNTIME')],
        },
        // Through a local name for the global object, or a function that only returns it.
        {
            code: 'const g = window; const p = g.CHATIC_APP_PLATFORM;',
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_PLATFORM')],
        },
        {
            code: 'const shell = () => window as unknown as Shell; shell().CHATIC_APP_STAGE;',
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_STAGE')],
        },
        // A compound assignment reads before it writes.
        {
            code: "window.CHATIC_APP_PLATFORM ??= 'web';",
            filename: FEATURE,
            options,
            errors: [global('CHATIC_APP_PLATFORM')],
        },
        // isNative handed on as a value is still the question asked.
        {
            code: "import { isNative } from '@chatic/bridges'; useSyncExternalStore(subscribe, isNative);",
            filename: FEATURE,
            options,
            errors: [probe('isNative()')],
        },
        // The runtime's second probe, called through the facade or imported.
        {
            code: 'if (runtime.boot.isNativeApp()) {}',
            filename: FEATURE,
            options,
            errors: [probe('isNativeApp()')],
        },
        {
            code: "import { isNativeApp } from '../utils/isNativeApp'; const x = { probe: isNativeApp };",
            filename: FEATURE,
            options,
            errors: [probe('isNativeApp()')],
        },
        // A folder entry allows that folder only, not a sibling that shares the prefix.
        {
            code: 'window.CHATIC_APP_PLATFORM;',
            filename: at('libs/bridges-extra/src/x.ts'),
            options,
            errors: [global('CHATIC_APP_PLATFORM')],
        },
    ],
});
