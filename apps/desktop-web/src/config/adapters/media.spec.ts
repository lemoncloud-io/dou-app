import { describe, expect, it } from 'vitest';

import type { WebHostFacts } from '@chatic/runtime-web';

import { desktopMedia } from './media';

const facts = {} as WebHostFacts;

describe('desktopMedia', () => {
    it.each([
        ['inside the desktop app', () => desktopMedia.shell({ kind: 'shell' }, facts), 'shell'],
        ['in a browser tab', () => desktopMedia.browser({ kind: 'browser' }, facts), 'browser'],
    ] as const)("leaves the picking to the page %s: none of the phone app's pieces", (_, side, kind) => {
        expect(side()).toEqual({
            kind,
            picker: null,
            photoLibrary: null,
            videoConverter: null,
            cameraPermission: null,
        });
    });
});
