import { useEffect, useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { startWebCoreInit, useInitWebCore } from '@chatic/web-core';

import { AppRoutes } from './routes';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

const Loading = () => (
    <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        초기화 중...
    </div>
);

const AppInner = () => {
    // Boot relay-session init (incl. token hydration) is owned by useInitWebCore →
    // initializeRelaySession; the standalone useTokenRefresh gate was removed from web-core
    // (mirrors desktop-web). Render once web-core is ready.
    const isWebCoreReady = useInitWebCore();

    if (!isWebCoreReady) {
        return <Loading />;
    }

    return (
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    );
};

export default function App() {
    const [transportReady, setTransportReady] = useState(false);

    // Transport bootstrap before session init (mirrors app-runtime TransportBootstrap).
    useEffect(() => {
        startWebCoreInit()
            .then(() => setTransportReady(true))
            .catch(() => setTransportReady(true));
    }, []);

    if (!transportReady) {
        return <Loading />;
    }

    return (
        <QueryClientProvider client={queryClient}>
            <AppInner />
        </QueryClientProvider>
    );
}
