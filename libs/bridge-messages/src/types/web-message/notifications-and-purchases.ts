import type {
    CheckAppUpdatePayload,
    DeleteFcmTokenPayload,
    FetchBadgeBasePayload,
    FetchBadgeCountPayload,
    FetchCurrentPurchasesPayload,
    FetchFcmTokenPayload,
    FetchProductsPayload,
    FetchPushMarksPayload,
    FetchUrlMetadataPayload,
    FinishPurchaseTransactionPayload,
    OpenStorePayload,
    OpenSubscriptionManagementPayload,
    PurchasePayload,
    RestartToUpdatePayload,
    SetBadgeCountPayload,
    ShowNotificationPayload,
    StartUpdateDownloadPayload,
} from '../model';

export type NotificationsAndPurchasesWebMessagePayloadMap = {
    FetchFcmToken: FetchFcmTokenPayload;
    FetchBadgeCount: FetchBadgeCountPayload;
    FetchBadgeBase: FetchBadgeBasePayload;
    FetchPushMarks: FetchPushMarksPayload;
    SetBadgeCount: SetBadgeCountPayload;
    ShowNotification: ShowNotificationPayload;
    FetchUrlMetadata: FetchUrlMetadataPayload;
    FetchProducts: FetchProductsPayload;
    FetchCurrentPurchases: FetchCurrentPurchasesPayload;
    Purchase: PurchasePayload;
    FinishPurchaseTransaction: FinishPurchaseTransactionPayload;
    OpenSubscriptionManagement: OpenSubscriptionManagementPayload;
    DeleteFcmToken: DeleteFcmTokenPayload;
    StartUpdateDownload: StartUpdateDownloadPayload;
    RestartToUpdate: RestartToUpdatePayload;
    CheckAppUpdate: CheckAppUpdatePayload;
    OpenStore: OpenStorePayload;
};
