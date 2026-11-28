import type {
    OnCheckAppUpdatePayload,
    OnDeleteFcmTokenPayload,
    OnFetchBadgeBasePayload,
    OnFetchBadgeCountPayload,
    OnFetchCurrentPurchasesPayload,
    OnFetchFcmTokenPayload,
    OnFetchProductsPayload,
    OnFetchPushMarksPayload,
    OnFetchUrlMetadataPayload,
    OnFinishPurchaseTransactionPayload,
    OnNotificationPayload,
    OnOpenStorePayload,
    OnOpenSubscriptionManagementPayload,
    OnPurchaseErrorPayload,
    OnPurchasePayload,
    OnPurchaseSuccessPayload,
    OnRestartToUpdatePayload,
    OnSetBadgeCountPayload,
    OnShowNotificationPayload,
    OnStartUpdateDownloadPayload,
    OnUpdateStatusPayload,
} from '../model';

export type NotificationsAndPurchasesAppMessageDataMap = {
    OnFetchFcmToken: OnFetchFcmTokenPayload;
    OnReceiveNotification: OnNotificationPayload;
    OnFetchBadgeCount: OnFetchBadgeCountPayload;
    OnFetchBadgeBase: OnFetchBadgeBasePayload;
    OnFetchPushMarks: OnFetchPushMarksPayload;
    OnSetBadgeCount: OnSetBadgeCountPayload;
    OnShowNotification: OnShowNotificationPayload;
    OnFetchUrlMetadata: OnFetchUrlMetadataPayload;
    OnFetchCurrentPurchases: OnFetchCurrentPurchasesPayload;
    OnFetchProducts: OnFetchProductsPayload;
    OnPurchase: OnPurchasePayload;
    OnPurchaseSuccess: OnPurchaseSuccessPayload;
    OnPurchaseError: OnPurchaseErrorPayload;
    OnFinishPurchaseTransaction: OnFinishPurchaseTransactionPayload;
    OnOpenSubscriptionManagement: OnOpenSubscriptionManagementPayload;
    OnDeleteFcmToken: OnDeleteFcmTokenPayload;
    OnUpdateStatus: OnUpdateStatusPayload;
    OnStartUpdateDownload: OnStartUpdateDownloadPayload;
    OnRestartToUpdate: OnRestartToUpdatePayload;
    OnCheckAppUpdate: OnCheckAppUpdatePayload;
    OnOpenStore: OnOpenStorePayload;
};
