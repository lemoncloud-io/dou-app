import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { RuntimeAuthHost, useRuntimeBinding } from '@chatic/app-runtime';

import { installGlobalErrorCapture } from './globalErrorCapture';
import { AppRoutes } from './routes';

// Uncaught throws and rejected promises. Installed at module scope so the
// listeners exist before the first render — a crash during boot is exactly the
// one worth catching.
installGlobalErrorCapture();

// Admin reads almost everything through React Query, so these two caches are
// where its failures actually surface.
const queryCache = new QueryCache({
    onError: (error: Error): void => {
        logger.error('GLOBAL', `[query] ${error.message}`, { error });
    },
});

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        logger.error('GLOBAL', `[mutation] ${error.message}`, { error });
    },
});

const queryClient = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

/**
 * Session + token lifecycle is owned by `RuntimeAuthHost` (app-runtime): it runs the single web-core
 * init (`useRelaySessionInit` → `initializeRelaySession`, incl. transport bootstrap) and mounts the
 * SDK-backed socket auth loop so tokens (and the HTTP signing credentials derived from them) stay
 * fresh. It deliberately excludes guest keep-alive and chat data sync — admin requires an explicit
 * login and needs no data scope. The host renders null until web-core is ready.
 */
const AppInner = () => {
    const binding = useRuntimeBinding();

    return (
        <RuntimeAuthHost binding={binding}>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </RuntimeAuthHost>
    );
};

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AppInner />
        </QueryClientProvider>
    );
}
