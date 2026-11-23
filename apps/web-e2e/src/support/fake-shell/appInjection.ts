import * as path from 'node:path';

import { guardAppInjection, type AppInjectionModule, type AppInjectionParams } from '@chatic/fake-shell';

const SOURCE = path.resolve(__dirname, '../../../../mobile/src/app/webview/utils/injectionScripts.ts');

export const loadAppInjection = async (): Promise<(params: AppInjectionParams) => string> =>
    guardAppInjection((await import(SOURCE)) as AppInjectionModule);
