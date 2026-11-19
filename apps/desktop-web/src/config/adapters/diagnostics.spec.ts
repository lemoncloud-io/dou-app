import { describe, expect, it } from 'vitest';

import type { WebHostFacts } from '@chatic/runtime-web';

import { desktopDiagnostics } from './diagnostics';

// Neither side reads the facts; the implementations decide from the side alone.
const facts = {} as WebHostFacts;

describe('desktopDiagnostics', () => {
    it('names the app icon as the entry point inside the desktop app, which keeps none of the phone app’s members', () => {
        expect(desktopDiagnostics.shell({ kind: 'shell' }, facts)).toEqual({
            kind: 'shell',
            entry: 'icon',
            debugMode: null,
            bootMetrics: null,
            pendingReports: null,
        });
    });

    it('names the browser as the entry point in a browser tab', () => {
        expect(desktopDiagnostics.browser({ kind: 'browser' }, facts)).toEqual({
            kind: 'browser',
            entry: 'browser',
            debugMode: null,
            bootMetrics: null,
            pendingReports: null,
        });
    });
});
