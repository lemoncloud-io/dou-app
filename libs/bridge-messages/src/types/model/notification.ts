export type NotificationInfo = {
    title?: string;
    body?: string;
    data?: Record<string, any>;
};

export type FetchFcmTokenPayload = {};

export type DeleteFcmTokenPayload = {};

export type FetchBadgeCountPayload = {};

export type OnFetchFcmTokenPayload = {
    token: string;
};

export type OnDeleteFcmTokenPayload = {
    success: boolean;
};

export type OnNotificationPayload = {
    notification: NotificationInfo;
};

export type SetBadgeCountPayload = {
    count: number;
    overlayIconDataUrl?: string;
};

export type OnFetchBadgeCountPayload = {
    count: number;
};

export type FetchBadgeBasePayload = {};

export type OnFetchBadgeBasePayload = {
    base: number | null;
};

export type OnSetBadgeCountPayload = {
    success: boolean;
};

export type ShowNotificationPayload = {
    title: string;
    body: string;
    channelId?: string;
    deeplink?: string;
};

export type OnShowNotificationPayload = {
    success: boolean;
};

export type PushCloudMarkRecord = {
    cid?: string;
    uid?: string;
    channelId?: string;
    sid?: string;
    channelName?: string;
};

export type FetchPushMarksPayload = {};

export type OnFetchPushMarksPayload = {
    marks: PushCloudMarkRecord[];
};
