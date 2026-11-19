import type {
    OnFetchShareIntakePayload,
    OnFetchUrlMetadataPayload,
    OnGetContactsPayload,
    OnSendSmsPayload,
    OnSubWebViewClosedPayload,
    SubWebViewOpenScope,
    SubWebViewParams,
} from '@chatic/bridge-messages';

import type { ShellOrBrowser } from './ports';

/**
 * Who takes the page's links out of it: opening a URL in the OS browser or a sub web view, the
 * clipboard, share intake, SMS and contact invites, and reading a link's preview. `shell` — the app
 * does, through its bridge; `browser` — the page does, with `window.open`, the Clipboard API and a
 * plain link.
 *
 * What every host can do, each in its own way, is a method. What only some apps have — a share sheet,
 * the address book, a link's preview — is a member that is `null` where the host has none, so a feature
 * asks for the member, not for the side.
 */
export interface LinksPort {
    readonly kind: ShellOrBrowser;
    /**
     * Opens `url` outside the page. The phone app hands it to the OS browser (`OpenURL`): loading an
     * arbitrary site inside its WebView would strand the person on a page with no way back and the
     * session's cookies attached. A browser opens a new tab with no opener and no referrer, and so does
     * the desktop app, which routes a new window to the OS browser itself.
     */
    openUrl(url: string): void;
    /**
     * Copies `text` and resolves `true` once it is copied. The phone app copies it (`CopyToClipboard`);
     * a request it fails or never answers is logged and resolves `false`, since the page has no other
     * clipboard to try. A browser, and the desktop app, which leaves the clipboard to the page, use the
     * Clipboard API and reject where there is none (an insecure context, an old WebView) or the write is
     * refused — the caller decides what that means to the person.
     */
    copyText(text: string): Promise<boolean>;
    /** The OS share sheet, for a link. `null` where there is none: a browser, and the desktop app. */
    readonly shareSheet: ShareSheet | null;
    /**
     * What another app shared to Dou, which the phone app copies into its own folder before it opens
     * the share page. `null` where nothing can share into the page: a browser, and the desktop app.
     */
    readonly shareIntake: ShareIntakeSource | null;
    /** The device's address book. `null` where the page has no access to one: a browser, and the desktop app. */
    readonly contacts: ContactsBook | null;
    /** The OS text-message composer. `null` where there is none: a browser, and the desktop app. */
    readonly sms: SmsComposer | null;
    /**
     * A link's preview, read from the page it points to. Only an app can: the page cannot read another
     * origin's HTML. `null` in a browser.
     */
    readonly linkPreview: LinkPreviewReader | null;
    /**
     * The app's sub web view, which shows a page on another origin over the app without leaving it.
     * `null` in a browser, which has none: a page meant for it opens in a new tab there.
     */
    readonly subWebView: SubWebViewOpener | null;
}

/** The OS share sheet. */
export interface ShareSheet {
    /** Offers `url` to the apps the OS shares with. Fire-and-forget: the sheet reports nothing back. */
    open(url: string): void;
}

/** The share another app handed to Dou, as the phone app holds it. */
export interface ShareIntakeSource {
    /**
     * The share behind `id`: its items as the app copied them, what it would not copy, and any shared
     * text. Waits as long as a slow copy of large videos takes. Rejects with the app's error `code` —
     * `GONE` for a share already released, `INVALID` for an id the app never made — or on a timeout.
     */
    fetch(id: string): Promise<OnFetchShareIntakePayload>;
    /**
     * Tells the app to forget the share. `discard` deletes its copies (the person cancelled); without
     * it the copies stay for the uploads still reading them. Rejects when the request fails.
     */
    release(id: string, options: { discard: boolean }): Promise<void>;
}

/** The device's address book. */
export interface ContactsBook {
    /**
     * Every contact, once the OS permission is asked for — so read it only when the person is about to
     * use it. The answer states the permission where the app is new enough to send it.
     */
    read(): Promise<OnGetContactsPayload>;
}

/** The OS text-message composer. */
export interface SmsComposer {
    /**
     * Opens the composer prefilled with `message` for `phoneNumbers`; the person still sends it. Resolves
     * with whether it opened — `undefined` from an app up to 0.28.4, which sends no answer body and
     * rejects when the composer cannot open. Rejects where the request fails.
     */
    compose(phoneNumbers: string | string[], message: string): Promise<OnSendSmsPayload | undefined>;
}

/** Reads a link's preview on the page's behalf. */
export interface LinkPreviewReader {
    /**
     * The preview fields of the page at `url`; `success: false` when it has none. Rejects when the app
     * cannot fetch it — an older app without the reader included.
     */
    fetch(url: string): Promise<OnFetchUrlMetadataPayload>;
}

/** The app's sub web view. */
export interface SubWebViewOpener {
    /**
     * How far the sub web view opens — `anyHttps`, or the reviewed pages only — as the app's handshake
     * says, or `null` when it says nothing: an app built before the field, a handshake that failed, or —
     * in the phone app, whose handshake is the one it sent at boot — one that has not landed yet.
     */
    openScope(): Promise<SubWebViewOpenScope | null>;
    /**
     * Shows `url` in the sub web view and resolves with its view id. Rejects with the app's refusal
     * (`NOT_ALLOWED`, `ALREADY_OPEN`, …), and with `NOT_FOUND` from an app built before the sub web view
     * — a caller that may meet one checks the handshake first. `params` reach the page as
     * `window.ChaticSubWebView.params`; `appId` names the app `url` was resolved from.
     */
    open(url: string, options?: { title?: string; params?: SubWebViewParams; appId?: string }): Promise<string>;
    /**
     * Calls `listener` each time a sub web view closes, with its view id, why it closed and the `result`
     * its page left. Every close is heard, not only those of views this caller opened, so a caller
     * matches the view id it holds. Returns the unsubscribe.
     */
    onClosed(listener: (closed: OnSubWebViewClosedPayload) => void): () => void;
}
