import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { appInitiatedTypes, appMessageTypes, pushEventSites } from './appEventContract';

type Decision = { emittedBy: string[]; test: string } | { notEmitted: string };

const MOBILE_APP_EVENTS = {
    OnBackPressed: {
        emittedBy: ['app/webview/hooks/useAndroidBack.ts', 'app/subWebView/SubWebView.tsx'],
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
    OnAudioRecordingEnded: {
        emittedBy: ['app/webview/hooks/audioRecordingHandlers.ts'],
        test: 'app/webview/hooks/audioRecordingHandlers.test.ts',
    },
    OnPurchaseSuccess: {
        emittedBy: ['app/webview/hooks/useSubscriptionIapHandler.ts'],
        test: 'app/webview/hooks/useSubscriptionIapHandler.test.ts',
    },
    OnPurchaseError: {
        emittedBy: ['app/webview/hooks/useSubscriptionIapHandler.ts'],
        test: 'app/webview/hooks/useSubscriptionIapHandler.test.ts',
    },
    OnSubWebViewClosed: {
        emittedBy: ['app/webview/hooks/subWebViewHandlers.ts'],
        test: 'app/webview/hooks/subWebViewHandlers.test.ts',
    },
    OnSubWebViewContextChanged: {
        emittedBy: ['app/subWebView/SubWebView.tsx'],
        test: 'app/subWebView/SubWebView.test.tsx',
    },
    OnSubWebViewCloseRequested: {
        emittedBy: ['app/subWebView/SubWebView.tsx'],
        test: 'app/subWebView/SubWebView.test.tsx',
    },
    OnUpdateStatus: { notEmitted: 'Desktop self-update; the phone updates through the store (CheckAppUpdate)' },
    OnRuntimeEvent: {
        emittedBy: ['app/services/runtime/runtimeBridge.ts', 'app/subWebView/subWebViewRuntimeBridge.ts'],
        test: 'app/services/runtime/runtimeBridge.test.ts',
    },
    OnRuntimeSessionChanged: {
        emittedBy: ['app/services/runtime/runtimeBridge.ts', 'app/subWebView/subWebViewRuntimeBridge.ts'],
        test: 'app/services/runtime/runtimeBridge.test.ts',
    },
} satisfies Record<string, Decision>;

const SRC = join(__dirname, '../../..');
const DECIDED: Record<string, Decision> = MOBILE_APP_EVENTS;
const EMITTED = Object.entries(DECIDED).filter(
    (entry): entry is [string, Extract<Decision, { emittedBy: string[] }>] => 'emittedBy' in entry[1]
);

describe('mobile app → web event inventory', () => {
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
