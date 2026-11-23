import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appInitiatedTypes, appMessageTypes, pushEventSites } from './appEventContract';

type Decision = { emittedBy: string[]; test: string } | { notEmitted: string };

const STORE_IAP = 'Store purchases happen on the phones only';

const DESKTOP_APP_EVENTS = {
    OnReceiveNotification: { emittedBy: ['main/shellEvents.ts'], test: 'main/shellEvents.test.ts' },
    OnFetchFcmToken: { emittedBy: ['main/shellEvents.ts'], test: 'main/shellEvents.test.ts' },
    OnUpdateStatus: { emittedBy: ['main/updater.ts'], test: 'main/updater.test.ts' },
    OnBackPressed: { notEmitted: 'No hardware back button; the renderer handles keyboard and mouse back itself' },
    OnNavigate: { notEmitted: "Deeplinks reach the web as OnReceiveNotification's data.deeplink, which it routes" },
    OnBackgroundStatusChanged: {
        notEmitted: "The phone's app-state push; desktop-web reads window visibility from the page itself",
    },
    OnUpdateDeviceInfo: {
        notEmitted: 'A phone store version check; the desktop reports its updates as OnUpdateStatus',
    },
    OnFileTransferState: {
        notEmitted: 'desktop-web transfers files in the browser; there is no StartFileTransfer here',
    },
    OnPurchaseSuccess: { notEmitted: STORE_IAP },
    OnPurchaseError: { notEmitted: STORE_IAP },
    OnSubWebViewClosed: {
        emittedBy: ['main/subWebView/DesktopSubWebViewService.ts'],
        test: 'main/subWebView/desktopSubWebView.test.ts',
    },
    OnSubWebViewContextChanged: {
        notEmitted: 'The desktop sub view keeps the theme and language it opened with; the page reads its context once',
    },
    OnSubWebViewCloseRequested: {
        notEmitted: 'The desktop page host has no close guard; SetSubWebViewCloseGuard answers NOT_FOUND there',
    },
    OnRuntimeEvent: { notEmitted: 'The desktop shell never owns the session, so it has no runtime to push from' },
    OnRuntimeSessionChanged: {
        notEmitted: 'The desktop shell never owns the session, so it has no runtime to push from',
    },
} satisfies Record<string, Decision>;

const SRC = join(__dirname, '..');
const DECIDED: Record<string, Decision> = DESKTOP_APP_EVENTS;
const EMITTED = Object.entries(DECIDED).filter(
    (entry): entry is [string, Extract<Decision, { emittedBy: string[] }>] => 'emittedBy' in entry[1]
);

describe('desktop app → web event inventory', () => {
    const vocabulary = appMessageTypes();
    const initiated = appInitiatedTypes();

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

    it('names exactly the files that push each event', () => {
        const declared = Object.fromEntries(
            EMITTED.map(([type, { emittedBy }]) => [type, [...emittedBy].sort()]).sort(([a], [b]) =>
                String(a).localeCompare(String(b))
            )
        );

        expect(pushEventSites(SRC)).toEqual(declared);
    });

    it.each(EMITTED)('triggers %s from a colocated test', (type, { test }) => {
        const file = join(SRC, test);

        expect(existsSync(file)).toBe(true);
        expect(readFileSync(file, 'utf8')).toContain('pushedEventErrors');
        expect(readFileSync(file, 'utf8')).toContain(`'${type}'`);
    });
});
