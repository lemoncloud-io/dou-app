import { useEffect, useRef } from 'react';
import { logger, webClient } from '@chatic/bridges';
import type { AppMessageData, AppMessageType } from '@chatic/app-messages';

/**
 * A React hook for subscribing to a specific message.
 */
export const useHandleAppMessage = <T extends AppMessageType>(
    type: T,
    handler: (message: AppMessageData<T>) => void | Promise<void>
): void => {
    const handlerRef = useRef(handler);

    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        const unsubscribe = webClient.onEvent(type, message => {
            // Log all inbound bridge messages in dev to aid debugging
            if (process.env.NODE_ENV === 'development') logger.debug('BRIDGE ←', type, message);
            handlerRef.current(message);
        });
        return unsubscribe;
    }, [type]);
};

// -------------------------------------------------------------
// Strongly-typed, per-event React hooks for the convenience of web app components
// -------------------------------------------------------------

export const useOnBackPressed = (handler: (message: AppMessageData<'OnBackPressed'>) => void) =>
    useHandleAppMessage('OnBackPressed', handler);

export const useOnGetContacts = (handler: (message: AppMessageData<'OnGetContacts'>) => void) =>
    useHandleAppMessage('OnGetContacts', handler);

export const useOnReceiveNotification = (handler: (message: AppMessageData<'OnReceiveNotification'>) => void) =>
    useHandleAppMessage('OnReceiveNotification', handler);

export const useOnUpdateDeviceInfo = (handler: (message: AppMessageData<'OnUpdateDeviceInfo'>) => void) =>
    useHandleAppMessage('OnUpdateDeviceInfo', handler);

export const useOnBackgroundStatusChanged = (handler: (message: AppMessageData<'OnBackgroundStatusChanged'>) => void) =>
    useHandleAppMessage('OnBackgroundStatusChanged', handler);

export const useOnSetCanGoBack = (handler: (message: AppMessageData<'OnSetCanGoBack'>) => void) =>
    useHandleAppMessage('OnSetCanGoBack', handler);

export const useOnOpenModal = (handler: (message: AppMessageData<'OnOpenModal'>) => void) =>
    useHandleAppMessage('OnOpenModal', handler);

export const useOnCloseModal = (handler: (message: AppMessageData<'OnCloseModal'>) => void) =>
    useHandleAppMessage('OnCloseModal', handler);

export const useOnUploadProgress = (handler: (message: AppMessageData<'OnUploadProgress'>) => void) =>
    useHandleAppMessage('OnUploadProgress', handler);

export const useOnUploadComplete = (handler: (message: AppMessageData<'OnUploadComplete'>) => void) =>
    useHandleAppMessage('OnUploadComplete', handler);

export const useOnPurchaseSuccess = (handler: (message: AppMessageData<'OnPurchaseSuccess'>) => void) =>
    useHandleAppMessage('OnPurchaseSuccess', handler);

export const useOnPurchaseError = (handler: (message: AppMessageData<'OnPurchaseError'>) => void) =>
    useHandleAppMessage('OnPurchaseError', handler);

export const useOnFinishPurchaseTransaction = (
    handler: (message: AppMessageData<'OnFinishPurchaseTransaction'>) => void
) => useHandleAppMessage('OnFinishPurchaseTransaction', handler);

export const useOnFetchCurrentPurchases = (handler: (message: AppMessageData<'OnFetchCurrentPurchases'>) => void) =>
    useHandleAppMessage('OnFetchCurrentPurchases', handler);

export const useOnFetchProducts = (handler: (message: AppMessageData<'OnFetchProducts'>) => void) =>
    useHandleAppMessage('OnFetchProducts', handler);

// The `OnFetchAppLogBuffer` / `OnPollAppLogBuffer` / `OnClearAppLogBuffer` /
// `OnFetchAppLogBufferSize` hooks are gone with the ring buffer. They had no
// consumers even before that — these four messages are request/response, so
// callers read the resolved promise rather than subscribing to an event.

export const useOnOAuthLogin = (handler: (message: AppMessageData<'OnOAuthLogin'>) => void) =>
    useHandleAppMessage('OnOAuthLogin', handler);

export const useOnFetchFcmToken = (handler: (message: AppMessageData<'OnFetchFcmToken'>) => void) =>
    useHandleAppMessage('OnFetchFcmToken', handler);

export const useOnNavigate = (handler: (message: AppMessageData<'OnNavigate'>) => void) =>
    useHandleAppMessage('OnNavigate', handler);

export const useOnFetchPreference = (handler: (message: AppMessageData<'OnFetchPreference'>) => void) =>
    useHandleAppMessage('OnFetchPreference', handler);
