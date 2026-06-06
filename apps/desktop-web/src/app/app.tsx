import { Suspense } from 'react';
import { I18nextProvider } from 'react-i18next';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LoadingFallback } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';
import { useInitWebCore, useTokenRefresh, useWebCoreStore } from '@chatic/web-core';
import { DataProvider, GlobalChatSync, WebSocketV2Connection, useAutoSelectCloud } from '@chatic/app-runtime';

import i18n from '../i18n';
import { AppRouter } from './routes';
import { useDesktopNotifications } from './shared/hooks';

/** Mounts desktop OS-notification wiring inside DataProvider (needs engine repositories). */
const DesktopNotifications = () => {
    useDesktopNotifications();
    return null;
};

/** Bootstraps cloud selection for multi-cloud users (issues token for the active cloud). */
const CloudBootstrap = () => {
    useAutoSelectCloud();
    return null;
};

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

export function App() {
    const isWebCoreReady = useInitWebCore();
    const { isAuthenticated, profile } = useWebCoreStore();
    const { isInitialized: isTokenInitialized, initStatus } = useTokenRefresh(isWebCoreReady);

    // Fast path mirrors apps/web: render once webCore is ready and either the
    // session is unauthenticated, a cached profile exists, or refresh resolved.
    const canRenderApp =
        (isWebCoreReady && (!isAuthenticated || !!profile || (isTokenInitialized && initStatus === 'failed'))) ||
        !!profile;

    if (!canRenderApp) {
        return <LoadingFallback />;
    }

    return (
        <I18nextProvider i18n={i18n}>
            <Suspense fallback={<LoadingFallback />}>
                <QueryClientProvider client={queryClient}>
                    <ThemeProvider>
                        <DataProvider>
                            {isAuthenticated && isWebCoreReady && <WebSocketV2Connection />}
                            {isAuthenticated && isWebCoreReady && <GlobalChatSync />}
                            {isAuthenticated && isWebCoreReady && <CloudBootstrap />}
                            {isAuthenticated && isWebCoreReady && <DesktopNotifications />}
                            <AppRouter />
                        </DataProvider>
                    </ThemeProvider>
                </QueryClientProvider>
            </Suspense>
        </I18nextProvider>
    );
}

export default App;
