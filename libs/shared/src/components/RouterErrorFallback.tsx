import { useCallback, useEffect, useRef } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

import { AlertTriangle, Home, RefreshCw, ServerCrash } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { ERROR_MESSAGES } from '../consts';
import { NotFoundPage } from './NotFoundPage';

import type { ReactNode } from 'react';

interface RouterErrorFallbackProps {
    onError?: (error: Error, errorInfo: { componentStack?: string }) => void;
}

type RouterErrorType = 'notFound' | 'server' | 'unknown';

const ERROR_ICONS: Record<RouterErrorType, ReactNode> = {
    notFound: <AlertTriangle className="h-10 w-10 text-orange-500" />,
    server: <ServerCrash className="h-10 w-10 text-orange-500" />,
    unknown: <AlertTriangle className="h-10 w-10 text-orange-500" />,
};

const inferRouterErrorType = (error: unknown): RouterErrorType => {
    if (isRouteErrorResponse(error)) {
        if (error.status === 404) return 'notFound';
        if (error.status >= 500) return 'server';
    }
    return 'unknown';
};

const getErrorMessage = (error: unknown): string => {
    if (isRouteErrorResponse(error)) {
        return `${error.status} ${error.statusText}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return '알 수 없는 오류가 발생했습니다';
};

export const RouterErrorFallback = ({ onError }: RouterErrorFallbackProps): JSX.Element => {
    const error = useRouteError();
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);

    const errorType = inferRouterErrorType(error);
    const errorMessage = getErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    useEffect(() => {
        if (onError && errorType !== 'notFound') {
            const errorObj = error instanceof Error ? error : new Error(errorMessage);
            onError(errorObj, { componentStack: errorStack });
        }
    }, [error, errorMessage, errorStack, errorType, onError]);

    useEffect(() => {
        if (errorType !== 'notFound') {
            containerRef.current?.focus();
        }
    }, [errorType]);

    const handleRetry = useCallback((): void => {
        window.location.reload();
    }, []);

    const handleGoHome = useCallback((): void => {
        navigate('/');
    }, [navigate]);

    if (errorType === 'notFound') {
        return <NotFoundPage />;
    }

    const messages = errorType === 'server' ? ERROR_MESSAGES.server : ERROR_MESSAGES.unknown;
    const icon = ERROR_ICONS[errorType];

    return (
        <div
            ref={containerRef}
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            tabIndex={-1}
            className="min-h-screen bg-white flex items-center justify-center p-4 outline-none"
        >
            <div className="w-full max-w-md text-center space-y-8">
                <div className="flex justify-center">{icon}</div>

                <div className="space-y-3">
                    <h2 id="error-title" className="text-2xl font-bold text-neutral-900">
                        {messages.title}
                    </h2>
                    <p id="error-description" className="text-neutral-500 leading-relaxed">
                        {messages.description}
                    </p>
                </div>

                <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
                    <pre className="text-sm text-neutral-600 overflow-auto whitespace-pre-wrap break-words max-h-32">
                        {errorMessage}
                    </pre>
                </div>

                <div className="flex justify-center gap-3">
                    <Button
                        variant="outline"
                        onClick={handleGoHome}
                        className="border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                        aria-label="홈으로 이동"
                    >
                        <Home className="h-4 w-4 mr-2" />
                        <span>{messages.secondaryAction}</span>
                    </Button>
                    <Button
                        onClick={handleRetry}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                        aria-label="다시 시도"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        <span>{messages.primaryAction}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};
