import { describe, expect, it } from 'vitest';

import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import { pageUploadPut } from '../upload';
import { desktopFiles } from './files';

const facts = {} as WebHostFacts;

describe.each([
    ['inside the desktop app', () => desktopFiles.shell({ kind: 'shell' }, facts)],
    ['in a browser tab', () => desktopFiles.browser({ kind: 'browser' }, facts)],
])('desktopFiles — the page moves the files %s', (_, side) => {
    it("sends with the page's own PUT and has no app transfer module", () => {
        const port = side();

        expect(port.put).toBe(pageUploadPut);
        expect(port.transfers).toBeNull();
    });
});

describe('desktopFiles — the choice', () => {
    it('keeps the side it was built for', () => {
        expect(desktopFiles.shell({ kind: 'shell' }, facts).kind).toBe('shell');
        expect(desktopFiles.browser({ kind: 'browser' }, facts).kind).toBe('browser');
    });
});
