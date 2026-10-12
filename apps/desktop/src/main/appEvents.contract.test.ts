import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appInitiatedTypes, appMessageTypes, pushEventSites } from './appEventContract';

type Decision = { emittedBy: string[]; test: string } | { notEmitted: string };

const STORE_IAP = 'Store purchases happen on the phones only';

/**
 * Every app → web event the desktop shell could send on its own initiative, decided: either the
 * file that pushes it and the test that triggers it, or the reason it never does. Paths are relative
 * to `apps/desktop/src`. A new push-only message in `@chatic/app-messages`, or a new `pushEvent`
 * call here, fails this suite until it has a line.
 *
 * A reply type is listed too when the shell also pushes it unprompted — `OnFetchFcmToken` answers
 * `FetchFcmToken`, and is pushed again whenever the token is re-minted.
 */
const DESKTOP_APP_EVENTS = {
    OnReceiveNotification: { emittedBy: ['main/shellEvents.ts'], test: 'main/shellEvents.test.ts' },
    OnFetchFcmToken: { emittedBy: ['main/shellEvents.ts'], test: 'main/shellEvents.test.ts' },
    OnUpdateStatus: { emittedBy: ['main/updater.ts'], test: 'main/updater.test.ts' },
    OnBackPressed: { notEmitted: 'No hardware back button; the renderer handles keyboard and mouse back itself' },
    OnNavigate: { notEmitted: "Deeplinks reach the web as OnReceiveNotification's data.deeplink, which it routes" },
    OnUpdateDeviceInfo: {
        notEmitted: 'A phone store version check; the desktop reports its updates as OnUpdateStatus',
    },
    OnFileTransferState: {
        notEmitted: 'desktop-web transfers files in the browser; there is no StartFileTransfer here',
    },
    OnPurchaseSuccess: { notEmitted: STORE_IAP },
    OnPurchaseError: { notEmitted: STORE_IAP },
} satisfies Record<string, Decision>;

const SRC = join(__dirname, '..');
const DECIDED: Record<string, Decision> = DESKTOP_APP_EVENTS;
const EMITTED = Object.entries(DECIDED).filter(
    (entry): entry is [string, Extract<Decision, { emittedBy: string[] }>] => 'emittedBy' in entry[1]
);

describe('desktop app → web event inventory', () => {
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
