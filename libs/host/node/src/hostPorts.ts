import type { FilesPort, HostPorts } from '@chatic/ports';

import { fetchPut } from './fetchPut';

export interface NodeHostOptions {
    writeLine?: (line: string) => void;
    put?: FilesPort['put'];
}

const writeToStdout = (line: string): void => {
    process.stdout.write(`${line}\n`);
};

export const NODE_HOST_KIND = 'browser';

export const nodeHostPorts = ({ writeLine = writeToStdout, put = fetchPut }: NodeHostOptions = {}): HostPorts => ({
    checkout: { kind: 'none' },
    media: { kind: NODE_HOST_KIND, picker: null, photoLibrary: null, videoConverter: null, cameraPermission: null },
    files: { kind: NODE_HOST_KIND, put, transfers: null },
    links: {
        kind: NODE_HOST_KIND,
        openUrl: url => writeLine(url),
        copyText: async () => false,
        shareSheet: null,
        shareIntake: null,
        contacts: null,
        sms: null,
        linkPreview: null,
        subWebView: null,
    },
    appShell: {
        kind: NODE_HOST_KIND,
        os: null,
        ownsWindow: false,
        reportsKeyboardHeight: false,
        haptics: null,
        preferences: null,
        backGesture: null,
        iconBadge: null,
        dockBadge: null,
        appIcon: null,
        storeUpdate: null,
        selfUpdate: null,
        systemSettings: null,
    },
    signIn: {
        kind: NODE_HOST_KIND,
        os: null,
        sessionScope: 'device',
        approvesPairing: false,
        requestsPairing: false,
        providerSignIn: null,
        relayOAuth: null,
    },
    diagnostics: { kind: NODE_HOST_KIND, entry: 'browser', debugMode: null, bootMetrics: null, pendingReports: null },
    push: { kind: NODE_HOST_KIND, notifications: null, deviceToken: null, tokenRenewal: null, localBanner: null },
});
