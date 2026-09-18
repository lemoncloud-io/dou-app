import type { ShareAction } from 'react-native';

import type { CacheDomainVersions } from './cache';

/**
 * Detailed info for a device media asset (photo, video)
 */
export type MediaAsset = {
    /** Local filesystem URI */
    uri?: string;
    /** Original file name */
    fileName?: string;
    /** File MIME type (e.g. image/jpeg) */
    type?: string;
    /** Media width in pixels */
    width?: number;
    /** Media height in pixels */
    height?: number;
    /** File size (bytes) */
    fileSize?: number;
    /** Base64-encoded file data (included depending on options) */
    base64?: string;
};

/** * Detailed info for a device document file
 */
export type DocumentInfo = {
    /** Local filesystem URI */
    uri: string;
    /** Document file name */
    name?: string | null;
    /** File MIME type */
    type?: string | null;
    /** File size (bytes) */
    size?: number | null;
    /** Base64-encoded file data */
    base64?: string;
};

/** * Detailed info for a device contacts entry
 */
export type ContactInfo = {
    /** Unique identifier of the contact on the device */
    recordID: string;
    backTitle: string;
    /** Workplace / company name */
    company: string | null;
    /** List of registered email addresses */
    emailAddresses: EmailAddress[];
    /** Full display name */
    displayName: string;
    /** Family name (last name) */
    familyName: string;
    /** Given name (first name) */
    givenName: string;
    /** Middle name */
    middleName: string;
    /** Job title / position */
    jobTitle: string;
    /** List of registered phone numbers */
    phoneNumbers: PhoneNumber[];
    /** Whether the contact has a profile thumbnail */
    hasThumbnail: boolean;
    /** Local path of the contact's profile thumbnail */
    thumbnailPath: string;
    /** Whether the contact is starred/favorited */
    isStarred: boolean;
    /** List of registered postal addresses */
    postalAddresses: PostalAddress[];
    /** Name prefix (e.g. Mr., Dr.) */
    prefix: string;
    /** Name suffix (e.g. Jr., Sr.) */
    suffix: string;
    /** Department the contact belongs to */
    department: string;
    /** Birthday info */
    birthday?: Birthday;
    /** List of instant-messenger account addresses */
    imAddresses: InstantMessageAddress[];
    /** List of website URLs */
    urlAddresses: UrlAddress[];
    /** Contact note */
    note: string;
};

/** Email address info (e.g. label: 'work', email: 'dev@example.com') */
export type EmailAddress = {
    label: string;
    email: string;
};

/** Phone number info (e.g. label: 'mobile', number: '010-0000-0000') */
export type PhoneNumber = {
    label: string;
    number: string;
};

/** Postal address info */
export type PostalAddress = {
    /** Address label (e.g. 'home', 'work') */
    label: string;
    /** Full formatted address string */
    formattedAddress: string;
    /** Street name / road name */
    street: string;
    /** PO box number */
    pobox: string;
    /** Neighborhood / local area name */
    neighborhood: string;
    /** City / county / district */
    city: string;
    /** Metropolitan region / province */
    region: string;
    /** State */
    state: string;
    /** Postal code */
    postCode: string;
    /** Country name */
    country: string;
};

/** Birthday info */
export type Birthday = {
    day: number;
    month: number;
    /** Optional because some contacts store only month/day without a year — iOS omits `year` entirely in that case. */
    year?: number;
};

/** Instant-messenger account info */
export type InstantMessageAddress = {
    username: string;
    service: string;
};

/** URL address info */
export type UrlAddress = {
    label: string;
    url: string;
};

/** Native app permission type */
/**
 * OS permissions the web can request from the app.
 *
 * `MICROPHONE` was added on 2026-09-10 — **only the type was extended, no app release was
 * needed.** `usePermissionHandler` passes the payload straight through to
 * `permissionService.request`, and the app's `PERMISSION_MAP` already has `MICROPHONE`
 * (iOS `MICROPHONE` / Android `RECORD_AUDIO`), so existing builds already handle it at
 * runtime. This union, split into its own copy, was the only thing blocking that
 * capability (the app-side `services/permission/types.ts` now re-exports this
 * declaration).
 */
export type AppPermissionType = 'CONTACTS' | 'NOTIFICATIONS' | 'CAMERA' | 'PHOTO_LIBRARY' | 'MICROPHONE';

/** * Native app permission grant status */
export type PermissionStatus = 'GRANTED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';

/**
 * App background/foreground state
 */
export type AppBackgroundStatus = 'active' | 'background' | 'inactive';

/**
 * App icon choice info (Native -> Web)
 */
export type AppIconOption = {
    id: string | null;
    label: string;
};

/** [Request] Open the OS's default share sheet */
export type OpenShareSheetPayload = {
    /** Title of the content to share */
    title?: string;
    /** Message body text to share */
    message?: string;
    /** Website or file URL to share */
    url?: string;
    /** MIME type of the share target */
    type?: string;
    /** Subject used when sharing via email */
    subject?: string;
};

/** [Request] Open the document (file) picker */
export type OpenDocumentPayload = {
    /** Whether to allow multiple file selection */
    allowMultiSelection?: boolean;
    /** Array of MIME types allowed for selection (e.g. ['application/pdf']) */
    type?: string[];
    /** Whether to return file data as Base64 */
    includeBase64?: boolean;
};

/** [Request] Launch the native camera */
export type OpenCameraPayload = {
    /** Type of media to capture */
    mediaType?: 'photo' | 'video' | 'mixed';
    /** Image compression quality (0.0 lowest ~ 1.0 original) */
    quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
    /** Max width in pixels to resize to */
    maxWidth?: number;
    /** Max height in pixels to resize to */
    maxHeight?: number;
    /** Whether to include Base64 data */
    includeBase64?: boolean;
    /** Which camera lens to launch initially (front/back) */
    cameraType?: 'back' | 'front';
};

/** [Request] Open the native photo/video gallery */
export type OpenPhotoLibraryPayload = {
    /** Max number of media items selectable (0 means unlimited) */
    selectionLimit?: number;
    /** Type of media selectable */
    mediaType?: 'photo' | 'video' | 'mixed';
    /** Max width in pixels to resize selected media to */
    maxWidth?: number;
    /** Max height in pixels to resize selected media to */
    maxHeight?: number;
    /** Image compression quality (0.0 lowest ~ 1.0 original) */
    quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
    /** Whether to include Base64 data */
    includeBase64?: boolean;
};

/**
 * [Request] Open a URL in the device's default browser or an external app
 *
 * Passing the app's own scheme (`chatic://…`) round-trips through the OS and comes back
 * as an inbound deep link — that's why this command is also used to test deep-link
 * routing. A separate `SimulateInboundDeeplink` was drafted in ADR-0080 step 1 and then
 * withdrawn: the app's `deeplinkService.handleUrl` ends up calling the same
 * `Linking.openURL` anyway, and the relative-path normalization it adds is something the
 * web can already do directly via the `net.deeplink.scheme` key.
 */
export type OpenURLPayload = {
    /** External URL to open (http, mailto, tel, etc). Passing the app scheme makes it an inbound deep link */
    url: string;
};

/** [Request] Show the OS system permission request dialog */
export type RequestPermissionPayload = {
    /** Target permission to request */
    permission: AppPermissionType;
};

/** [Request] Set whether native back (swipe/hardware button) navigation is available */
export type SetCanGoBackPayload = {
    /** When true, in-webview routing is handled first */
    canGoBack: boolean;
};

/** [Request] Notify native when a scroll event occurs inside the webview */
export type ScrollDataPayload = {
    /** URL of the web page where the scroll is currently happening */
    url: string;
    /** Percentage representing scroll progress (0 ~ 100) */
    scrollPercentage: number;
};

/** [Request] Open a webview for a specific URL in a native bottom sheet/modal */
export type OpenModalPayload = {
    /** Web page URL to show as a modal */
    url: string;
    /** * The proportion and shape of screen coverage
     * - full: a modal covering the full screen
     * - sheet: a bottom sheet rising from the bottom of the screen
     */
    type?: 'full' | 'sheet';
    /** Height ratio the bottom sheet expands to (default 0.9; ignored and treated as 1 when type is full) */
    heightRatio?: number;
    /** Whether to show a drag handle bar at the top of the bottom sheet for closing */
    dragHandle?: boolean;
};

/** [Request] Change the app icon */
export type ChangeAppIconPayload = {
    /**
     * The alternate app icon key to switch to.
     * null, undefined, or 'default' restores the default app icon.
     */
    iconName?: string | null;
};

/** [Request] Close the native bottom sheet/modal */
export type CloseModalPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Open the native settings screen */
export type OpenSettingsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Notify that the web app is ready */
export type WebAppReadyPayload = {
    /** Web bundle/app version. Used for tracking deployment sync. */
    webVersion?: string;
    /** Bridge protocol version the web expects. */
    protocolVersion?: string;
    /** List of WebMessages the web can call. Used for capability negotiation. */
    supportedWebMessages?: string[];
};

/** [Request] Show loader (indicator) request */
export type ShowLoaderPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Hide loader (indicator) request */
export type HideLoaderPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Credential sync request */
export type SyncCredentialPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Pop (close) a webview from the webview stack */
export type PopWebViewPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * ----------------------------------------------------------------------
 * 3. Communication payloads (App -> Web responses)
 * ----------------------------------------------------------------------
 */

/** [Response] Share action completion result */
export type OnOpenShareSheetPayload = ShareAction;

/** [Response] List of files selected from the document picker */
export type OnOpenDocumentPayload = {
    documents: DocumentInfo[];
};

/** [Response] Returns the device's full contact list after obtaining contacts permission */
export type OnGetContactsPayload = {
    contacts: ContactInfo[];
};

/** [Response] Returns the result of a camera capture */
export type OnOpenCameraPayload = {
    assets: MediaAsset[];
};

/** [Response] Returns the item(s) selected from the photo gallery */
export type OnOpenPhotoLibraryPayload = {
    assets: MediaAsset[];
};

/** [Response] Returns the result of a system permission request */
export type OnRequestPermissionPayload = {
    /** The permission that was requested */
    permission: AppPermissionType;
    /** Final grant/deny status */
    status: PermissionStatus;
};

/** [Response] Notifies status when the app goes to background or returns to foreground */
export type OnBackgroundStatusChangedPayload = {
    /** Current app state (active, background, inactive) */
    status: AppBackgroundStatus;
    /** Whether the app is hidden in the background */
    isBackground: boolean;
    /** Whether the app is currently interacting with the user in the foreground */
    isForeground: boolean;
};

/** [Response] Current app icon state */
export type OnFetchAppIconPayload = {
    /** Currently applied app icon key. 'default' if using the default icon */
    iconName: string;
    /** Whether dynamic app icon changes are supported on the current platform */
    supported: boolean;
    /** Reason the lookup failed */
    error?: string;
};

/** [Response] List of available app icons */
export type OnFetchAppIconListPayload = {
    /** Full list of available icons */
    availableIcons: AppIconOption[];
};

/** [Response] Result of changing the app icon */
export type OnChangeAppIconPayload = {
    /** Whether the change succeeded */
    success: boolean;
    /** The requested app icon key. null if the default icon was requested */
    requestedIconName?: string | null;
    /** The app icon key actually applied after the change */
    iconName?: string;
    /** Whether dynamic app icon changes are supported on the current platform */
    supported?: boolean;
    /** Reason the change failed */
    error?: string;
};

export type PingPayload = {
    payload: string;
};
export type PongPayload = {
    payload: string;
};

/** [Request] Send SMS */
export type SendSmsPayload = {
    /** Recipient phone number, or array of phone numbers */
    phoneNumbers: string | string[];
    /** SMS message body to send */
    message: string;
};

/** [Response] SMS send result */
export type OnSendSmsPayload = {
    /** Whether sending (opening the app) succeeded */
    success: boolean;
};

/** [Response] Result of setting native back (swipe/hardware button) navigation availability */
export type OnSetCanGoBackPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of opening a webview for a specific URL in a native bottom sheet/modal */
export type OnOpenModalPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of closing the native bottom sheet/modal */
export type OnCloseModalPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of opening the native settings screen */
export type OnOpenSettingsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * [Response] WebAppReady handshake result
 * Lets the two sides confirm supported messages and capabilities even when the Web/App
 * deployment isn't in sync.
 */
export type OnWebAppReadyPayload = {
    /** App bridge/runtime version */
    appVersion?: string;
    /** Bridge protocol version to use for the current conversation */
    protocolVersion: string;
    /** List of WebMessages the App can handle */
    supportedWebMessages: string[];
    /** List of AppMessages the App can send to Web */
    supportedAppMessages: string[];
    /**
     * The schema version of the App's local cache DB (target for native SQLite's `PRAGMA
     * user_version`).
     *
     * Since ADR-0053, this is **no longer read for routing decisions** — the logical
     * contract (`cacheDomainVersions`) and the physical DB version were split apart. It's
     * still sent for debugging/logging purposes, and kept for backward compatibility with
     * older web bundles that read only this field.
     */
    cacheSchemaVersion?: number;
    /**
     * List of CacheTypes the App can store/query as local cache. Treated as legacy if not
     * reported.
     *
     * Since ADR-0053, the web converts this list to "revision 1 for that domain" — a
     * backward-compatibility axis that preserves the routing behavior of older apps that
     * don't send a revision number.
     */
    supportedCacheTypes?: string[];
    /**
     * Per-domain cache contract revision numbers the App has **implemented** (ADR-0053).
     *
     * The web compares these against the revision it requires, domain by domain, to
     * reconcile storage. An older app that doesn't send this field is treated as revision 1
     * via `supportedCacheTypes` above, so the outcome doesn't change. Hosts without a local
     * cache DB (the desktop main process) will continue to omit it.
     */
    cacheDomainVersions?: CacheDomainVersions;
    /** Feature flags. New features are negotiated here before use. */
    capabilities?: Record<string, boolean | string | number>;
};

/** [Response] Result of handling the show-loader request */
export type OnShowLoaderPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of handling the hide-loader request */
export type OnHideLoaderPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of handling the credential sync request */
export type OnSyncCredentialPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of handling the webview pop request */
export type OnPopWebViewPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of handling the file upload start request */
export type OnRequestFileUploadPayload = {
    uploadId: string;
    success: boolean;
};

/** [Response] Result of handling the file upload pause request */
export type OnPauseFileUploadPayload = {
    uploadId: string;
    success: boolean;
};

/** [Response] Result of handling the file upload resume request */
export type OnResumeFileUploadPayload = {
    uploadId: string;
    success: boolean;
};

/** [Response] Result of handling the file upload cancel request */
export type OnCancelFileUploadPayload = {
    uploadId: string;
    success: boolean;
};

/** [Response] Result of manually recovering (resuming) an upload task */
export type OnRecoverUploadPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of retrying an upload task */
export type OnRetryUploadPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Native back-button pressed event payload */
export type OnBackPressedPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Result of opening a URL in the device's default browser or an external app */
export type OnOpenURLPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Payload for a dynamic navigation request from the native app to the web app */
export type OnNavigatePayload = {
    /** Relative path and query parameters to navigate to (e.g. '/chats/ch_123' or '/auth/login?code=...') */
    path: string;
    /** Whether to use replace for the React Router navigation (default: false) */
    replace?: boolean;
};

/** [Request] Payload to dismiss the overlay after the webview returns from background */
export type DismissResumeOverlayPayload = {
    // Empty object type
};

/** [Response] Payload for the result of dismissing the overlay after the webview returns from background */
export type OnDismissResumeOverlayPayload = {
    // Empty object type
};
