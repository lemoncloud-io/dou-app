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

export interface LinksPort {
    readonly kind: ShellOrBrowser;
    openUrl(url: string): void;
    copyText(text: string): Promise<boolean>;
    readonly shareSheet: ShareSheet | null;
    readonly shareIntake: ShareIntakeSource | null;
    readonly contacts: ContactsBook | null;
    readonly sms: SmsComposer | null;
    readonly linkPreview: LinkPreviewReader | null;
    readonly subWebView: SubWebViewOpener | null;
}

export interface ShareSheet {
    open(url: string): void;
}

export interface ShareIntakeSource {
    fetch(id: string): Promise<OnFetchShareIntakePayload>;
    release(id: string, options: { discard: boolean }): Promise<void>;
}

export interface ContactsBook {
    read(): Promise<OnGetContactsPayload>;
}

export interface SmsComposer {
    compose(phoneNumbers: string | string[], message: string): Promise<OnSendSmsPayload | undefined>;
}

export interface LinkPreviewReader {
    fetch(url: string): Promise<OnFetchUrlMetadataPayload>;
}

export interface SubWebViewOpener {
    openScope(): Promise<SubWebViewOpenScope | null>;
    open(url: string, options?: { title?: string; params?: SubWebViewParams; appId?: string }): Promise<string>;
    onClosed(listener: (closed: OnSubWebViewClosedPayload) => void): () => void;
}
