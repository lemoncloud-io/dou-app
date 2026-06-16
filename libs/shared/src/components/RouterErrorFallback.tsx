import { type JSX, useCallback, useEffect, useRef } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { AlertTriangle, Home, RefreshCw, ServerCrash } from 'lucide-react';

import { Logo } from '@chatic/assets';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { ERROR_MESSAGES } from '../consts';
import { NotFoundPage } from './NotFoundPage';

import type { ReactNode } from 'react';

interface RouterErrorFallbackProps {
    onError?: (error: Error, errorInfo: { componentStack?: string }) => void;
}

type RouterErrorType = 'notFound' | 'server' | 'unknown';

const ERROR_ICONS: Record<RouterErrorType, ReactNode> = {
    notFound: <AlertTriangle className="h-8 w-8 text-muted-foreground" />,
    server: <ServerCrash className="h-8 w-8 text-muted-foreground" />,
    unknown: <AlertTriangle className="h-8 w-8 text-muted-foreground" />,
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
        window.location.href = '/';
    }, []);

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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6 outline-none"
        >
            {/* Logo */}
            <div className="mb-10 opacity-40">
                <img src={Logo.logo} alt="DoU" className="h-16 w-16 object-contain" />
            </div>

            {/* Icon */}
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">{icon}</div>

            {/* Title & Description */}
            <h2 className="mb-2 text-[18px] font-semibold leading-[1.5] text-foreground">{messages.title}</h2>
            <p className="mb-6 max-w-[280px] text-center text-[14px] leading-[1.571] text-muted-foreground">
                {messages.description}
            </p>

            {/* Error Detail (collapsible) */}
            <details className="mb-8 w-full max-w-[320px]">
                <summary className="cursor-pointer text-center text-[12px] text-muted-foreground hover:text-foreground">
                    상세 정보 보기
                </summary>
                <div className="mt-2 rounded-lg border border-border bg-muted/50 p-3">
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-muted-foreground">
                        {errorMessage}
                    </pre>
                </div>
            </details>

            {/* Actions */}
            <div className="flex w-full max-w-[280px] flex-col gap-3">
                <Button
                    onClick={handleRetry}
                    className="h-[50px] w-full rounded-full bg-[#B0EA10] text-[16px] font-semibold text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {messages.primaryAction}
                </Button>
                <Button
                    variant="ghost"
                    onClick={handleGoHome}
                    className="h-[44px] w-full rounded-full text-[14px] font-medium text-muted-foreground hover:text-foreground"
                >
                    <Home className="mr-2 h-4 w-4" />
                    {messages.secondaryAction}
                </Button>
            </div>
        </div>
    );
};
