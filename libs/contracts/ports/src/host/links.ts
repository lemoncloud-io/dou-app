import type { PickedShellAttachment, RefusedAttachment } from './media';
import type { ShellOrBrowser } from './ports';

export type ShareIntake = {
    items: PickedShellAttachment[];
    refused: RefusedAttachment[];
    text?: string;
};

export type UrlMetadata = {
    success: boolean;
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
};

export type ContactEmailAddress = {
    label: string;
    email: string;
};

export type ContactPhoneNumber = {
    label: string;
    number: string;
};

export type ContactPostalAddress = {
    label: string;
    formattedAddress: string;
    street: string;
    pobox: string;
    neighborhood: string;
    city: string;
    region: string;
    state: string;
    postCode: string;
    country: string;
};

export type ContactBirthday = {
    day: number;
    month: number;
    year?: number;
};

export type ContactMessagingAddress = {
    username: string;
    service: string;
};

export type ContactUrlAddress = {
    label: string;
    url: string;
};

export type Contact = {
    recordID: string;
    backTitle: string;
    company: string | null;
    emailAddresses: ContactEmailAddress[];
    displayName: string;
    familyName: string;
    givenName: string;
    middleName: string;
    jobTitle: string;
    phoneNumbers: ContactPhoneNumber[];
    hasThumbnail: boolean;
    thumbnailPath: string;
    isStarred: boolean;
    postalAddresses: ContactPostalAddress[];
    prefix: string;
    suffix: string;
    department: string;
    birthday?: ContactBirthday;
    imAddresses: ContactMessagingAddress[];
    urlAddresses: ContactUrlAddress[];
    note: string;
};

export type ContactsPermission = 'granted' | 'denied';

export type ContactsReadout = {
    contacts: Contact[];
    permission?: ContactsPermission;
};

export type SmsResult = {
    success: boolean;
};

export type SubWebViewOpenScope = 'reviewed' | 'anyHttps';

export type SubWebViewParams = { [key: string]: unknown };

export type SubWebViewCloseReason = 'user' | 'host' | 'system' | 'page';

export type SubWebViewClosed = {
    viewId: string;
    reason: SubWebViewCloseReason;
    result?: unknown;
};

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
    fetch(id: string): Promise<ShareIntake>;
    release(id: string, options: { discard: boolean }): Promise<void>;
}

export interface ContactsBook {
    read(): Promise<ContactsReadout>;
}

export interface SmsComposer {
    compose(phoneNumbers: string | string[], message: string): Promise<SmsResult | undefined>;
}

export interface LinkPreviewReader {
    fetch(url: string): Promise<UrlMetadata>;
}

export interface SubWebViewOpener {
    openScope(): Promise<SubWebViewOpenScope | null>;
    open(url: string, options?: { title?: string; params?: SubWebViewParams; appId?: string }): Promise<string>;
    onClosed(listener: (closed: SubWebViewClosed) => void): () => void;
}
