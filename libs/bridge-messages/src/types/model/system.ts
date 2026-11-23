import type { ShareAction } from 'react-native';

import type { CacheDomainVersions } from './cache';
import type { HandedOverPerfTrace } from './perf';
import type { SubWebViewContext, SubWebViewOpenScope } from './sub-webview';

export type MediaAsset = {
    uri?: string;
    fileName?: string;
    type?: string;
    width?: number;
    height?: number;
    fileSize?: number;
    base64?: string;
};

export type DocumentInfo = {
    uri: string;
    name?: string | null;
    type?: string | null;
    size?: number | null;
    base64?: string;
};

export type ContactInfo = {
    recordID: string;
    backTitle: string;
    company: string | null;
    emailAddresses: EmailAddress[];
    displayName: string;
    familyName: string;
    givenName: string;
    middleName: string;
    jobTitle: string;
    phoneNumbers: PhoneNumber[];
    hasThumbnail: boolean;
    thumbnailPath: string;
    isStarred: boolean;
    postalAddresses: PostalAddress[];
    prefix: string;
    suffix: string;
    department: string;
    birthday?: Birthday;
    imAddresses: InstantMessageAddress[];
    urlAddresses: UrlAddress[];
    note: string;
};

export type EmailAddress = {
    label: string;
    email: string;
};

export type PhoneNumber = {
    label: string;
    number: string;
};

export type PostalAddress = {
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

export type Birthday = {
    day: number;
    month: number;
    year?: number;
};

export type InstantMessageAddress = {
    username: string;
    service: string;
};

export type UrlAddress = {
    label: string;
    url: string;
};

export type AppPermissionType = 'CONTACTS' | 'NOTIFICATIONS' | 'CAMERA' | 'PHOTO_LIBRARY' | 'MICROPHONE';

export type PermissionStatus = 'GRANTED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';

export type AppBackgroundStatus = 'active' | 'background' | 'inactive';

export type AppIconOption = {
    id: string | null;
    label: string;
};

export type OpenShareSheetPayload = {
    title?: string;
    message?: string;
    url?: string;
    type?: string;
    subject?: string;
};

export type OpenDocumentPayload = {
    allowMultiSelection?: boolean;
    type?: string[];
    includeBase64?: boolean;
};

export type OpenCameraPayload = {
    mediaType?: 'photo' | 'video' | 'mixed';
    quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
    maxWidth?: number;
    maxHeight?: number;
    includeBase64?: boolean;
    cameraType?: 'back' | 'front';
};

export type OpenPhotoLibraryPayload = {
    selectionLimit?: number;
    mediaType?: 'photo' | 'video' | 'mixed';
    maxWidth?: number;
    maxHeight?: number;
    quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
    includeBase64?: boolean;
};

export type OpenURLPayload = {
    url: string;
};

export type RequestPermissionPayload = {
    permission: AppPermissionType;
};

export type SetCanGoBackPayload = {
    canGoBack: boolean;
    includesHistory?: boolean;
};

export type ScrollDataPayload = {
    url: string;
    scrollPercentage: number;
};

export type ChangeAppIconPayload = {
    iconName?: string | null;
};

export type OpenSettingsPayload = {};

export type WebAppReadyPayload = {
    webVersion?: string;
    protocolVersion?: string;
    supportedWebMessages?: string[];
    holdsBootSplash?: boolean;
};

export type OnOpenShareSheetPayload = ShareAction;

export type OnOpenDocumentPayload = {
    documents: DocumentInfo[];
};

export type ContactsPermission = 'granted' | 'denied';

export type OnGetContactsPayload = {
    contacts: ContactInfo[];
    permission?: ContactsPermission;
};

export type OnOpenCameraPayload = {
    assets: MediaAsset[];
};

export type OnOpenPhotoLibraryPayload = {
    assets: MediaAsset[];
};

export type OnRequestPermissionPayload = {
    permission: AppPermissionType;
    status: PermissionStatus;
};

export type OnBackgroundStatusChangedPayload = {
    status: AppBackgroundStatus;
    isBackground: boolean;
    isForeground: boolean;
};

export type OnFetchAppIconPayload = {
    iconName: string;
    supported: boolean;
    error?: string;
};

export type OnFetchAppIconListPayload = {
    availableIcons: AppIconOption[];
};

export type OnChangeAppIconPayload = {
    success: boolean;
    requestedIconName?: string | null;
    iconName?: string;
    supported?: boolean;
    error?: string;
};

export type PingPayload = {
    payload: string;
};
export type PongPayload = {
    payload: string;
};

export type SendSmsPayload = {
    phoneNumbers: string | string[];
    message: string;
};

export type OnSendSmsPayload = {
    success: boolean;
};

export type OnSetCanGoBackPayload = {};

export type OnOpenSettingsPayload = {};

export type OnWebAppReadyPayload = {
    appVersion?: string;
    protocolVersion: string;
    supportedWebMessages: string[];
    supportedAppMessages: string[];
    cacheSchemaVersion?: number;
    supportedCacheTypes?: string[];
    cacheDomainVersions?: CacheDomainVersions;
    capabilities?: Record<string, boolean | string | number>;
    subWebView?: SubWebViewContext;
    subWebViewOpenScope?: SubWebViewOpenScope;
};

export type OnBackPressedPayload = {};

export type OnOpenURLPayload = {};

export type OnNavigatePayload = {
    path: string;
    replace?: boolean;
    perfTrace?: HandedOverPerfTrace;
};

export type DismissResumeOverlayPayload = {};

export type OnDismissResumeOverlayPayload = {};

export type FirstScreenReadyPayload = {};

export type OnFirstScreenReadyPayload = {};
