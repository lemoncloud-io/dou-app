import { useEffect, useRef } from 'react';
import { logger, webClient } from '@chatic/bridges';
import type { AppMessageData, AppMessageType } from '@chatic/bridge-messages';

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
            if (process.env.NODE_ENV === 'development') logger.debug('BRIDGE ←', type, message);
            handlerRef.current(message);
        });
        return unsubscribe;
    }, [type]);
};

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

export const useOnFileTransferState = (handler: (message: AppMessageData<'OnFileTransferState'>) => void) =>
    useHandleAppMessage('OnFileTransferState', handler);

export const useOnFinishPurchaseTransaction = (
    handler: (message: AppMessageData<'OnFinishPurchaseTransaction'>) => void
) => useHandleAppMessage('OnFinishPurchaseTransaction', handler);

export const useOnFetchCurrentPurchases = (handler: (message: AppMessageData<'OnFetchCurrentPurchases'>) => void) =>
    useHandleAppMessage('OnFetchCurrentPurchases', handler);

export const useOnFetchProducts = (handler: (message: AppMessageData<'OnFetchProducts'>) => void) =>
    useHandleAppMessage('OnFetchProducts', handler);

export const useOnFetchFcmToken = (handler: (message: AppMessageData<'OnFetchFcmToken'>) => void) =>
    useHandleAppMessage('OnFetchFcmToken', handler);

export const useOnNavigate = (handler: (message: AppMessageData<'OnNavigate'>) => void) =>
    useHandleAppMessage('OnNavigate', handler);

export const useOnFetchPreference = (handler: (message: AppMessageData<'OnFetchPreference'>) => void) =>
    useHandleAppMessage('OnFetchPreference', handler);
