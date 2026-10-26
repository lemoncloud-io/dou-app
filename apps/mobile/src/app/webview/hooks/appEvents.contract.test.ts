import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { appInitiatedTypes, appMessageTypes, pushEventSites } from './appEventContract';

type Decision = { emittedBy: string[]; test: string } | { notEmitted: string };

/**
 * Every app → web event this shell could send on its own initiative, decided: either the file that
 * pushes it and the test that triggers it, or the reason it never does. Paths are relative to
 * `apps/mobile/src`. A new push-only message in `@chatic/app-messages`, or a new `pushEvent` call
 * here, fails this suite until it has a line.
 */
const MOBILE_APP_EVENTS = {
    OnBackPressed: {
        emittedBy: ['app/webview/hooks/useAndroidBack.ts'],
        test: 'app/webview/hooks/useAndroidBack.test.ts',
    },
    OnBackgroundStatusChanged: {
        emittedBy: ['app/webview/hooks/useAppStateHandler.ts'],
        test: 'app/webview/hooks/useAppStateHandler.test.ts',
    },
    OnNavigate: {
        emittedBy: ['app/webview/hooks/useDeepLinkNavigation.ts'],
        test: 'app/webview/hooks/useDeepLinkNavigation.test.ts',
    },
    OnReceiveNotification: {
        emittedBy: ['app/webview/hooks/useFcmHandler.ts'],
        test: 'app/webview/hooks/useFcmHandler.test.ts',
    },
    OnUpdateDeviceInfo: {
        emittedBy: ['app/webview/hooks/useVersionCheckHandler.ts'],
        test: 'app/webview/hooks/useVersionCheckHandler.test.ts',
    },
    OnFileTransferState: {
        emittedBy: ['app/webview/hooks/fileTransferHandlers.ts'],
        test: 'app/webview/hooks/fileTransferHandlers.test.ts',
    },
    OnPurchaseSuccess: {
        emittedBy: ['app/webview/hooks/useSubscriptionIapHandler.ts'],
        test: 'app/webview/hooks/useSubscriptionIapHandler.test.ts',
    },
    OnPurchaseError: {
        emittedBy: ['app/webview/hooks/useSubscriptionIapHandler.ts'],
        test: 'app/webview/hooks/useSubscriptionIapHandler.test.ts',
    },
    OnUpdateStatus: { notEmitted: 'Desktop self-update; the phone updates through the store (CheckAppUpdate)' },
} satisfies Record<string, Decision>;

const SRC = join(__dirname, '../../..');
const DECIDED: Record<string, Decision> = MOBILE_APP_EVENTS;
const EMITTED = Object.entries(DECIDED).filter(
    (entry): entry is [string, Extract<Decision, { emittedBy: string[] }>] => 'emittedBy' in entry[1]
);

describe('mobile app → web event inventory', () => {
    // Computed once: each read compiles the vocabulary.
    const vocabulary = appMessageTypes();
    const initiated = appInitiatedTypes();

    // Guards the guards: an unresolved vocabulary reads as an empty list, and every check below
    // would then pass on nothing.
    it('reads the push-only messages out of the vocabulary', () => {
        expect(initiated).toEqual(expect.arrayContaining(['OnBackPressed', 'OnNavigate', 'OnReceiveNotification']));
        expect(vocabulary.length).toBeGreaterThan(initiated.length);
    });

    it('decides every push-only message in the vocabulary', () => {
        const undecided = initiated.filter(type => !(type in DECIDED));

        expect(undecided).toEqual([]);
    });

    it('decides only messages the vocabulary declares', () => {
        const stale = Object.keys(DECIDED).filter(type => !vocabulary.includes(type));

        expect(stale).toEqual([]);
    });

    // Read off the source, so an event pushed from a file nobody listed, a listed one that stopped
    // pushing, and a `pushEvent` whose type is computed all show up as a difference.
    it('names exactly the files that push each event', () => {
        const declared = Object.fromEntries(
            EMITTED.map(([type, { emittedBy }]) => [type, [...emittedBy].sort()]).sort(([a], [b]) =>
                String(a).localeCompare(String(b))
            )
        );

        expect(pushEventSites(SRC)).toEqual(declared);
    });

    // A pointer, not proof: it finds the test and the helper's name in it. That the test really
    // triggers the event is the colocated test's own assertion.
    it.each(EMITTED)('triggers %s from a colocated test', (type, { test }) => {
        const file = join(SRC, test);

        expect(existsSync(file)).toBe(true);
        expect(readFileSync(file, 'utf8')).toContain('pushedEventErrors');
        expect(readFileSync(file, 'utf8')).toContain(`'${type}'`);
    });
});
