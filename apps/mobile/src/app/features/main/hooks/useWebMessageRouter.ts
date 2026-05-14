import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { WebViewBridge } from '../../../webview';
import {
    useAppIconHandler,
    useCrudCacheHandler,
    useDeviceHandler,
    useFcmHandler,
    useLogBufferHandler,
    useLogHandler,
    useOAuthHandler,
    usePermissionHandler,
    usePreferenceCacheHandler,
    useSafeAreaHandler,
    useSearchCacheHandler,
    useSubscriptionIapHandler,
} from '../../../webview/hooks';
import { useModalHandler } from '../../../webview/hooks/useModalHandler';

import type { WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';
import type { MainScreenProps } from '../navigation';
import { useAppStateHandler } from '../../../webview/hooks/useAppStateHandler';
import { useLanguageStore, useThemeStore } from '../../../stores';
import { logger } from '../../../services';

/**
 * Props for the useWebMessageRouter hook.
 */
export interface UseWebMessageRouterProps {
    /** Bridge instance for communicating with the WebView */
    bridge: WebViewBridge;
    /** React Navigation object for navigating to native screens (e.g., Modals) */
    navigation: MainScreenProps['navigation'];
    /** Callback to update the state indicating if the web layer can handle back navigation */
    setWebCanGoBack: (canGoBack: boolean) => void;
}

/**
 * Central router for handling messages sent from the Web (WebView) to the Native App.
 * It acts as a Facade, delegating specific tasks to domain-specific handler hooks.
 * This hook also implements a message queue to process incoming messages sequentially, preventing race conditions and bottlenecks.
 *
 * @param props - Dependencies injected from the MainScreen (bridge, navigation, etc.)
 * @returns An object containing the message handler callback and IAP loading state.
 */
export const useWebMessageRouter = ({ bridge, navigation, setWebCanGoBack }: UseWebMessageRouterProps) => {
    // --- Message Queue State ---
    const queueRef = useRef<WebMessageData<WebMessageType>[]>([]);
    const isProcessingRef = useRef(false);

    // --- Global App States ---
    const setLanguage = useLanguageStore(state => state.setLanguage);
    const setTheme = useThemeStore(state => state.setTheme);

    // --- Domain-specific Handlers (memoized with useCallback) ---
    const { fetchSafeAreaInfo } = useSafeAreaHandler(bridge);
    const { syncAppStateToWeb } = useAppStateHandler(bridge);
    const { fetchFcmToken } = useFcmHandler(bridge);
    const {
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        isIapLoading,
    } = useSubscriptionIapHandler(bridge);

    const {
        handleFetchAllCache,
        handleFetchCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleClearCache,
    } = useCrudCacheHandler(bridge);

    const { handleFetchPreference, handleSavePreference, handleDeletePreference } = usePreferenceCacheHandler(bridge);
    const { handleSendLog } = useLogHandler();
    const { handleFetchAppLogBuffer, handlePollAppLogBuffer, handleClearAppLogBuffer, handleFetchAppLogBufferSize } =
        useLogBufferHandler(bridge);

    const { handleSearchGlobalCache } = useSearchCacheHandler(bridge);

    const {
        handleOpenSettings,
        handleOpenShareSheet,
        handleOpenDocument,
        handleGetContacts,
        handleOpenCamera,
        handleOpenPhotoLibrary,
        handleOpenURL,
    } = useDeviceHandler(bridge);

    const { handleRequestPermission } = usePermissionHandler(bridge);
    const { handleOAuthLogin, handleOAuthLogout } = useOAuthHandler(bridge);
    const { handleFetchAppIcon, handleFetchAppIconList, handleChangeAppIcon } = useAppIconHandler(bridge);

    const { handleOpenModal, handleCloseModal } = useModalHandler(bridge, navigation);

    // --- Keep handlers fresh for async execution without triggering re-renders ---
    const handlersRef = useRef({
        setWebCanGoBack,
        fetchFcmToken,
        fetchSafeAreaInfo,
        syncAppStateToWeb,
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        handleOpenModal,
        handleCloseModal,
        handleFetchCache,
        handleFetchAllCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleSearchGlobalCache,
        handleClearCache,
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
        handleFetchAppLogBuffer,
        handlePollAppLogBuffer,
        handleClearAppLogBuffer,
        handleFetchAppLogBufferSize,
        handleSendLog,
        handleOpenSettings,
        handleOpenShareSheet,
        handleOpenDocument,
        handleGetContacts,
        handleOpenCamera,
        handleOpenPhotoLibrary,
        handleRequestPermission,
        handleOAuthLogin,
        handleOAuthLogout,
        handleOpenURL,
        handleFetchAppIcon,
        handleFetchAppIconList,
        handleChangeAppIcon,
    });

    useEffect(() => {
        handlersRef.current = {
            setWebCanGoBack,
            fetchFcmToken,
            fetchSafeAreaInfo,
            syncAppStateToWeb,
            fetchProducts,
            fetchCurrentPurchases,
            handlePurchaseSubscription,
            handleFinishPurchase,
            handleOpenSubscriptionManagement,
            handleOpenModal,
            handleCloseModal,
            handleFetchCache,
            handleFetchAllCache,
            handleSaveCache,
            handleSaveAllCache,
            handleDeleteCache,
            handleDeleteAllCache,
            handleSearchGlobalCache,
            handleClearCache,
            handleFetchPreference,
            handleSavePreference,
            handleDeletePreference,
            handleFetchAppLogBuffer,
            handlePollAppLogBuffer,
            handleClearAppLogBuffer,
            handleFetchAppLogBufferSize,
            handleSendLog,
            handleOpenSettings,
            handleOpenShareSheet,
            handleOpenDocument,
            handleGetContacts,
            handleOpenCamera,
            handleOpenPhotoLibrary,
            handleRequestPermission,
            handleOAuthLogin,
            handleOAuthLogout,
            handleOpenURL,
            handleFetchAppIcon,
            handleFetchAppIconList,
            handleChangeAppIcon,
        };
    });

    // --- Message Processing Queue ---
    const processQueue = useCallback(async () => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        while (queueRef.current.length > 0) {
            const message = queueRef.current[0];
            const handlers = handlersRef.current;

            try {
                // Each case should be awaited to ensure sequential processing
                switch (message.type) {
                    // -- App Settings & UI State --
                    case 'SetCanGoBack':
                        handlers.setWebCanGoBack(message.data.canGoBack);
                        break;
                    // -- Push Notifications & Device Info --
                    case 'FetchFcmToken':
                        await handlers.fetchFcmToken();
                        break;
                    case 'FetchSafeArea':
                        handlers.fetchSafeAreaInfo(); // This is sync, no await needed
                        break;
                    case 'FetchBackgroundStatus':
                        handlers.syncAppStateToWeb(); // This is sync, no await needed
                        break;
                    // -- In-App Purchases (IAP) --
                    case 'FetchProducts':
                        await handlers.fetchProducts();
                        break;
                    case 'FetchCurrentPurchases':
                        await handlers.fetchCurrentPurchases();
                        break;
                    case 'Purchase':
                        await handlers.handlePurchaseSubscription(message.data);
                        break;
                    case 'FinishPurchaseTransaction':
                        await handlers.handleFinishPurchase(message.data.purchase);
                        break;
                    case `OpenSubscriptionManagement`:
                        await handlers.handleOpenSubscriptionManagement();
                        break;
                    // -- Native Modals --
                    case 'OpenModal':
                        handlers.handleOpenModal(message.data); // Navigation is sync
                        break;
                    case 'CloseModal':
                        handlers.handleCloseModal(); // Navigation is sync
                        break;
                    // -- Cache Management --
                    case 'FetchCacheData':
                        await handlers.handleFetchCache(message);
                        break;
                    case 'FetchAllCacheData':
                        await handlers.handleFetchAllCache(message);
                        break;
                    case 'SaveCacheData':
                        await handlers.handleSaveCache(message);
                        break;
                    case 'SaveAllCacheData':
                        await handlers.handleSaveAllCache(message);
                        break;
                    case 'DeleteCacheData':
                        await handlers.handleDeleteCache(message);
                        break;
                    case 'DeleteAllCacheData':
                        await handlers.handleDeleteAllCache(message);
                        break;
                    case `SearchGlobalCacheData`:
                        await handlers.handleSearchGlobalCache(message);
                        break;
                    case 'ClearCacheData':
                        await handlers.handleClearCache(message);
                        break;
                    // -- Preference Management --
                    case 'FetchPreference':
                        await handlers.handleFetchPreference(message);
                        break;
                    case 'SavePreference':
                        await handlers.handleSavePreference(message);
                        break;
                    case 'DeletePreference':
                        await handlers.handleDeletePreference(message);
                        break;
                    case 'FetchAppLogBuffer':
                        await handlers.handleFetchAppLogBuffer(message);
                        break;
                    case 'PollAppLogBuffer':
                        await handlers.handlePollAppLogBuffer(message);
                        break;
                    case 'ClearAppLogBuffer':
                        await handlers.handleClearAppLogBuffer(message);
                        break;
                    case 'FetchAppLogBufferSize':
                        await handlers.handleFetchAppLogBufferSize(message);
                        break;
                    case 'SendLog':
                        handlers.handleSendLog(message); // Fire-and-forget is ok for logging
                        break;
                    // -- Native Device Features --
                    case 'OpenSettings':
                        await handlers.handleOpenSettings();
                        break;
                    case 'OpenShareSheet':
                        await handlers.handleOpenShareSheet(message);
                        break;
                    case 'OpenDocument':
                        await handlers.handleOpenDocument(message);
                        break;
                    case 'GetContacts':
                        await handlers.handleGetContacts(message);
                        break;
                    case 'OpenCamera':
                        await handlers.handleOpenCamera(message);
                        break;
                    case 'OpenPhotoLibrary':
                        await handlers.handleOpenPhotoLibrary(message);
                        break;
                    case 'RequestPermission':
                        await handlers.handleRequestPermission(message.data);
                        break;
                    // -- Authentication & External Links --
                    case 'OAuthLogin':
                        await handlers.handleOAuthLogin(message.data.provider);
                        break;
                    case 'OAuthLogout':
                        await handlers.handleOAuthLogout(message.data.provider);
                        break;
                    case 'OpenURL':
                        await handlers.handleOpenURL(message);
                        break;
                    case 'FetchAppIcon':
                        await handlers.handleFetchAppIcon(message);
                        break;
                    case 'FetchAppIconList':
                        await handlers.handleFetchAppIconList(message);
                        break;
                    case 'ChangeAppIcon':
                        await handlers.handleChangeAppIcon(message);
                        break;
                    default:
                        if ((message as any).type === '__console__') {
                            const m = message as any;
                            if (m.level === 'error') {
                                logger.error('WEBVIEW', m.msg, m.data);
                            } else {
                                logger.info('WEBVIEW', m.msg, m.data);
                            }
                        } else {
                            console.error(`Received unhandled message type: ${message.type}`);
                        }
                }
            } catch (error) {
                logger.error('BRIDGE', `Error processing message type ${message.type}:`, error);
            } finally {
                queueRef.current.shift();
            }
        }

        isProcessingRef.current = false;
    }, []);

    /**
     * The main message receiver.
     */
    const handleMessage = useMemo(() => {
        return bridge.receive(
            (message: WebMessageData<WebMessageType>) => {
                queueRef.current.push(message);
                void processQueue();
            },
            (error: unknown, nativeEvent: WebViewMessage) => {
                logger.error('BRIDGE', `Failed to parse message: ${nativeEvent.data}`, error);
            }
        );
    }, [bridge, processQueue]);

    return { handleMessage, isIapLoading };
};
