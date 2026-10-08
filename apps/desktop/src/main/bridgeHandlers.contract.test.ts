import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { WEB_MESSAGE_RESPONSE_TYPE, type WebMessagePayloadMap, type WebMessageType } from '@chatic/app-messages';
import { AppBridgeHost, JsonProtocol, type RequestMessage, type ResponseMessage } from '@chatic/bridges';

import { registerHandlers, type DesktopBridgeDeps } from './bridgeHandlers';
import { startUpdater } from './updater';

// updater.ts registers the two auto-update handlers and is the one module here that needs electron.
// Packaged, so it registers them; the update feed itself is a stub.
jest.mock('electron', () => ({ app: { isPackaged: true, on: jest.fn() }, powerMonitor: { on: jest.fn() } }));
jest.mock('electron-updater', () => ({
    __esModule: true,
    default: {
        autoUpdater: {
            on: jest.fn(),
            checkForUpdates: jest.fn(() => Promise.resolve()),
            downloadUpdate: jest.fn(() => Promise.resolve()),
            quitAndInstall: jest.fn(),
        },
    },
}));
jest.mock('./unfurl', () => ({
    fetchUrlMetadata: jest.fn(async (url: string) => ({ success: true, url, title: 'Example' })),
}));

// Reasons shared by many lines below. desktop-web sends six requests of its own, all handled; of the
// rest, only SavePreference reaches this shell (see its line), and the others belong to the phone
// shell or to nobody.
const NEVER_SENT = 'Declared, but no web build sends it';
const PHONE = 'Phone OS or hardware surface with no desktop counterpart';
const BROWSER = 'desktop-web does it with the browser (file input, downloads, clipboard, links)';
const NO_STORE = 'No cache, preference or config store in the main process; desktop-web keeps them in the renderer';
const PHONE_PUSH = "Phone push bookkeeping; desktop push arrives through the main process's FCM receiver";
const PHONE_LOGS = "The phone shell's log relay and report queue; desktop-web never sends them";
const PHONE_TOOLING = "The phone shell's boot, resume, perf and debug-panel tooling";
const STORE_IAP = 'Store purchases happen on the phones only';
const SYSTEM_BROWSER_LOGIN = 'Desktop social login runs in the system browser and returns by deeplink';
const STORE_UPDATE = 'Store update check; desktop updates itself (StartUpdateDownload / RestartToUpdate)';

/**
 * Requests in `WEB_MESSAGE_RESPONSE_TYPE` the desktop shell deliberately leaves unregistered. The
 * host answers each with `NOT_FOUND`. A message belongs here only by decision — a new one in
 * `@chatic/app-messages` fails this suite until it has a handler or a line here.
 */
const DESKTOP_UNSUPPORTED = {
    SetCanGoBack: PHONE,
    OpenModal: NEVER_SENT,
    CloseModal: NEVER_SENT,
    OpenSettings: PHONE,
    StartFileTransfer: BROWSER,
    CancelFileTransfer: BROWSER,
    ListFileTransfers: BROWSER,
    AckFileTransfers: BROWSER,
    WriteTempFile: BROWSER,
    CreateDummyFile: PHONE_TOOLING,
    OpenShareSheet: PHONE,
    GetContacts: PHONE,
    OpenDocument: BROWSER,
    OpenCamera: PHONE,
    OpenPhotoLibrary: BROWSER,
    ListPhotoAlbums: BROWSER,
    ListPhotos: BROWSER,
    ReadPhoto: BROWSER,
    KeepLibraryVideo: BROWSER,
    ManagePhotoSelection: BROWSER,
    SaveToPhotoLibrary: PHONE,
    ShareFile: PHONE,
    OpenFile: BROWSER,
    SaveFile: BROWSER,
    PickAttachments: BROWSER,
    PrepareVideo: BROWSER,
    ReadAttachment: BROWSER,
    ReadVideoFrame: BROWSER,
    FetchSafeArea: PHONE,
    FetchBackgroundStatus: PHONE,
    RequestPermission: PHONE,
    OpenURL: BROWSER,
    SendSms: PHONE,
    FetchAppIcon: PHONE,
    FetchAppIconList: PHONE,
    ChangeAppIcon: PHONE,
    CopyToClipboard: BROWSER,
    TriggerHaptic: PHONE,
    DismissResumeOverlay: PHONE_TOOLING,
    FirstScreenReady: PHONE_TOOLING,
    FetchBadgeCount: PHONE_PUSH,
    FetchBadgeBase: PHONE_PUSH,
    FetchPushMarks: PHONE_PUSH,
    FetchProducts: STORE_IAP,
    FetchCurrentPurchases: STORE_IAP,
    Purchase: STORE_IAP,
    FinishPurchaseTransaction: STORE_IAP,
    OpenSubscriptionManagement: STORE_IAP,
    FetchCacheData: NO_STORE,
    FetchManyCacheData: NO_STORE,
    FetchLastChatsData: NO_STORE,
    FetchAllCacheData: NO_STORE,
    SaveCacheData: NO_STORE,
    SaveAllCacheData: NO_STORE,
    DeleteCacheData: NO_STORE,
    DeleteAllCacheData: NO_STORE,
    ClearCacheData: NO_STORE,
    ClearCacheDataByChannel: NO_STORE,
    SearchGlobalCacheData: NO_STORE,
    FetchPreference: NO_STORE,
    // @chatic/theme posts it whenever isNative() holds, and the desktop preload makes that true.
    SavePreference: 'Sent by @chatic/theme; the theme lives in the renderer, so NOT_FOUND is the answer',
    DeletePreference: NO_STORE,
    OAuthLogin: SYSTEM_BROWSER_LOGIN,
    OAuthLogout: SYSTEM_BROWSER_LOGIN,
    SaveConfigValue: NO_STORE,
    ClearConfigValue: NO_STORE,
    DeleteFcmToken: PHONE_TOOLING,
    FetchBootRecords: PHONE_TOOLING,
    ClearBootRecords: PHONE_TOOLING,
    ApplyCustomZip: PHONE_TOOLING,
    DisableCustomZip: PHONE_TOOLING,
    FetchCustomZipStatus: PHONE_TOOLING,
    ShowLoader: NEVER_SENT,
    HideLoader: NEVER_SENT,
    SyncCredential: NEVER_SENT,
    PopWebView: NEVER_SENT,
    FetchAppLogBuffer: PHONE_LOGS,
    PollAppLogBuffer: PHONE_LOGS,
    ClearAppLogBuffer: PHONE_LOGS,
    FetchAppLogBufferSize: PHONE_LOGS,
    SendLog: PHONE_LOGS,
    FetchLogUploadQueue: PHONE_LOGS,
    AckLogUploadQueue: PHONE_LOGS,
    ClearLogUploadQueue: PHONE_LOGS,
    FetchPendingReports: PHONE_LOGS,
    AckPendingReports: PHONE_LOGS,
    SendBootMetrics: PHONE_TOOLING,
    SetDebugMode: PHONE_TOOLING,
    StartPerfTrace: PHONE_TOOLING,
    StopPerfTrace: PHONE_TOOLING,
    Ping: "Debug overlay's round-trip probe; the NOT_FOUND reply already proves the channel",
    FetchTestRecord: NO_STORE,
    FetchAllTestRecords: NO_STORE,
    SaveTestRecord: NO_STORE,
    SaveAllTestRecords: NO_STORE,
    ClearTestRecords: NO_STORE,
    CheckAppUpdate: STORE_UPDATE,
    OpenStore: STORE_UPDATE,
} satisfies Partial<Record<WebMessageType, string>>;

/**
 * A request each handled message can be sent with. A new desktop handler needs a line here, which is
 * what gets it exercised below.
 */
const SAMPLE_REQUESTS: Partial<{ [K in WebMessageType]: WebMessagePayloadMap[K] }> = {
    WebAppReady: {},
    ShowNotification: { title: 'Alex', body: 'hello', deeplink: 'chatic://room/1' },
    FetchUrlMetadata: { url: 'https://example.com' },
    FetchFcmToken: {},
    SetBadgeCount: { count: 3 },
    StartUpdateDownload: {},
    RestartToUpdate: {},
};

const VOCABULARY = Object.keys(WEB_MESSAGE_RESPONSE_TYPE) as WebMessageType[];
const UNSUPPORTED = Object.keys(DESKTOP_UNSUPPORTED);

const createDeps = (): jest.Mocked<DesktopBridgeDeps> => ({
    showNotification: jest.fn(),
    awaitFcmToken: jest.fn(() => Promise.resolve('fcm-token')),
    setBadgeCount: jest.fn<boolean, [number, string?]>(() => true),
});

/**
 * A real host with everything the desktop main process registers on it, and the replies it sent.
 * This repeats createWindow's two calls (registerHandlers, startUpdater) rather than running them:
 * index.ts cannot load under jest. The registration-site test below keeps a third call site out.
 */
const createShell = (deps = createDeps()) => {
    const replies: ResponseMessage[] = [];
    const host = new AppBridgeHost({
        sendToWeb: raw => replies.push(JsonProtocol.decode(raw) as ResponseMessage),
    });
    registerHandlers(host, deps);
    // startUpdater arms a check loop; the contract only needs what it registers.
    const interval = jest.spyOn(global, 'setInterval').mockReturnValue(0 as any);
    startUpdater(host, jest.fn());
    interval.mockRestore();

    const send = async (type: WebMessageType, data: unknown): Promise<ResponseMessage | undefined> => {
        const refId = `ref-${type}`;
        const request = { type, data, refId, version: '1' } as RequestMessage;
        await host.handleMessage(JsonProtocol.encode(request) as string);
        return replies.find(reply => reply.refId === refId);
    };
    return { host, deps, send };
};

describe('desktop bridge contract', () => {
    // Read off a real host, so `WebAppReady` — answered inside `AppBridgeHost` — counts too.
    const registeredTypes = (): string[] => {
        const register = jest.spyOn(AppBridgeHost.prototype, 'registerHandler');
        createShell();
        const types = register.mock.calls.map(call => call[0] as string);
        register.mockRestore();
        return types;
    };

    it('answers every request in the vocabulary, or lists it as unsupported', () => {
        const registered = new Set(registeredTypes());

        const undecided = VOCABULARY.filter(type => !registered.has(type) && !UNSUPPORTED.includes(type));

        expect(undecided).toEqual([]);
    });

    it('registers no handler for a request outside the vocabulary', () => {
        const stale = registeredTypes().filter(type => !(type in WEB_MESSAGE_RESPONSE_TYPE));

        expect(stale).toEqual([]);
    });

    // The `satisfies` above says the same, but only to tsc — and CI's type check skips test files,
    // nor does this suite's transform report it.
    it('lists as unsupported only requests in the vocabulary', () => {
        const stale = UNSUPPORTED.filter(type => !(type in WEB_MESSAGE_RESPONSE_TYPE));

        expect(stale).toEqual([]);
    });

    it('lists as unsupported only requests that have no handler', () => {
        const registered = new Set(registeredTypes());

        const handled = UNSUPPORTED.filter(type => registered.has(type));

        expect(handled).toEqual([]);
    });

    // Every handler, really run: the reply type the web checks against is the one the map names.
    // A handler registered anywhere else is invisible to the checks above, so a message already
    // listed as unsupported could gain one without failing them.
    it('registers handlers only in the files this suite loads', () => {
        const allowed = ['bridgeHandlers.ts', 'updater.ts'];
        const sources = (dir: string): string[] =>
            readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
                entry.isDirectory() ? sources(join(dir, entry.name)) : [join(dir, entry.name)]
            );

        const elsewhere = sources(join(__dirname, '..'))
            .filter(file => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
            .filter(file => readFileSync(file, 'utf8').includes('.registerHandler('))
            .map(file => relative(__dirname, file))
            .filter(file => !allowed.includes(file));

        expect(elsewhere).toEqual([]);
    });

    it.each(registeredTypes())('answers %s with its mapped reply type', async type => {
        const sample = SAMPLE_REQUESTS[type as WebMessageType];
        expect(sample).toBeDefined();

        const reply = await createShell().send(type as WebMessageType, sample);

        expect(reply).toEqual(
            expect.objectContaining({ type: WEB_MESSAGE_RESPONSE_TYPE[type as WebMessageType], success: true })
        );
    });

    it.each(UNSUPPORTED)('answers unsupported %s with NOT_FOUND', async type => {
        const reply = await createShell().send(type as WebMessageType, {});

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'NOT_FOUND' }) })
        );
    });
});

describe('desktop bridge handlers', () => {
    it('raises an OS notification with the title, body and deeplink', async () => {
        const shell = createShell();

        await shell.send('ShowNotification', { title: 'Alex', body: 'hello', deeplink: 'chatic://room/1' });

        expect(shell.deps.showNotification).toHaveBeenCalledWith({
            title: 'Alex',
            body: 'hello',
            deeplink: 'chatic://room/1',
        });
    });

    it('answers FetchFcmToken with the token registration produced', async () => {
        const reply = await createShell().send('FetchFcmToken', {});

        expect(reply).toEqual(expect.objectContaining({ data: { token: 'fcm-token' } }));
    });

    // The badge reply carries whether the OS took it, which the web reads.
    it.each([true, false])('passes the count and overlay on and reports success=%s', async took => {
        const deps = createDeps();
        deps.setBadgeCount.mockReturnValue(took);

        const reply = await createShell(deps).send('SetBadgeCount', {
            count: 4,
            overlayIconDataUrl: 'data:image/png;base64,AA==',
        });

        expect(deps.setBadgeCount).toHaveBeenCalledWith(4, 'data:image/png;base64,AA==');
        expect(reply).toEqual(expect.objectContaining({ data: { success: took } }));
    });
});
