import type {
    AppShellPort,
    DiagnosticsPort,
    FilesPort,
    LinksPort,
    MediaPort,
    PushPort,
    SignInPort,
} from '@chatic/ports';

import { browserImages } from './media/browserImages';
import { pageLinks } from './pageLinks';

export const browserAppShell = (base: Pick<AppShellPort, 'kind' | 'os'>): AppShellPort => ({
    ...base,
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
});

export const browserDiagnostics = (base: Pick<DiagnosticsPort, 'kind'>): DiagnosticsPort => ({
    ...base,
    entry: 'browser',
    debugMode: null,
    bootMetrics: null,
    pendingReports: null,
});

export const browserFiles =
    (put: FilesPort['put']) =>
    (base: Pick<FilesPort, 'kind'>): FilesPort => ({ ...base, put, transfers: null });

export const browserLinks = (base: Pick<LinksPort, 'kind'>): LinksPort => ({
    ...base,
    ...pageLinks,
    shareSheet: null,
    shareIntake: null,
    contacts: null,
    sms: null,
    linkPreview: null,
    subWebView: null,
});

export const browserMedia = (base: Pick<MediaPort, 'kind'>): MediaPort => ({
    ...base,
    picker: null,
    photoLibrary: null,
    videoConverter: null,
    cameraPermission: null,
    images: browserImages,
});

export const browserPush = (base: Pick<PushPort, 'kind'>): PushPort => ({
    ...base,
    notifications: null,
    deviceToken: null,
    tokenRenewal: null,
    localBanner: null,
});

export const browserSignIn = (base: Pick<SignInPort, 'kind' | 'os'>): SignInPort => ({
    ...base,
    sessionScope: 'tab',
    approvesPairing: false,
    requestsPairing: true,
    providerSignIn: null,
    relayOAuth: null,
});
