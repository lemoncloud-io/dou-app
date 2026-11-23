import { createConsoleListener, logHub } from '@chatic/bridges';

import { diagnosticsKind } from '../../../config/diagnosticsKind';

export interface ConsoleListenerOptions {
    isDev: boolean;
}

export const attachConsoleListener = ({ isDev }: ConsoleListenerOptions): (() => void) => {
    if (diagnosticsKind() === 'shell' && !isDev) return () => undefined;

    return logHub.subscribe(createConsoleListener());
};
