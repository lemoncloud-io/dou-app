import * as path from 'node:path';

import { guardAppInjection, type AppInjectionModule, type AppInjectionParams } from '@chatic/fake-shell';

const SOURCE = path.resolve(__dirname, '../../../../mobile/src/app/webview/utils/injectionScripts.ts');

/**
 * The mobile app's own boot script builder, loaded at run time from a computed path — never a static
 * import, for the reason `guardAppInjection` gives. The returned builder refuses a script that leaves a
 * global `undefined`.
 */
export const loadAppInjection = async (): Promise<(params: AppInjectionParams) => string> =>
    guardAppInjection((await import(SOURCE)) as AppInjectionModule);
