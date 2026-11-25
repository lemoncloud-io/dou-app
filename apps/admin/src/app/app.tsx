import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

import { installGlobalErrorCapture } from './globalErrorCapture';
import { AppRoutes } from './routes';

installGlobalErrorCapture();

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

const AppInner = () => {
    return (
        <runtime.connection.RuntimeAuthHost>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </runtime.connection.RuntimeAuthHost>
    );
};

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AppInner />
        </QueryClientProvider>
    );
}
