import { useCallback, useEffect, useRef, useState } from 'react';

import { AlertTriangle, Home, RefreshCw, ServerCrash, ShieldOff, WifiOff } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { ERROR_MESSAGES } from '../consts';

import type { ComponentType, ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';

export type ErrorType = 'network' | 'auth' | 'server' | 'client' | 'unknown';

interface ErrorFallbackProps extends FallbackProps {
    errorType?: ErrorType;
}

const ERROR_ICONS: Record<ErrorType, ReactNode> = {
    network: <WifiOff className="h-10 w-10 text-orange-500" />,
    auth: <ShieldOff className="h-10 w-10 text-orange-500" />,
    server: <ServerCrash className="h-10 w-10 text-orange-500" />,
    client: <AlertTriangle className="h-10 w-10 text-orange-500" />,
    unknown: <AlertTriangle className="h-10 w-10 text-orange-500" />,
};

const inferErrorType = (error: Error): ErrorType => {
    const message = error.message.toLowerCase();

    if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('timeout') ||
        message.includes('연결')
    ) {
        return 'network';
    }
    if (
        message.includes('401') ||
        message.includes('403') ||
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('인증') ||
        message.includes('토큰')
    ) {
        return 'auth';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('서버')) {
        return 'server';
    }
    if (message.includes('400') || message.includes('404') || message.includes('요청')) {
        return 'client';
    }

    return 'unknown';
};

export const ErrorFallback: ComponentType<ErrorFallbackProps> = ({ error, resetErrorBoundary, errorType }) => {
    const errorContainerRef = useRef<HTMLDivElement>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    const resolvedErrorType = errorType ?? inferErrorType(error);
    const messages = ERROR_MESSAGES[resolvedErrorType];
    const icon = ERROR_ICONS[resolvedErrorType];

    useEffect(() => {
        errorContainerRef.current?.focus();
    }, []);

    const handleRetry = useCallback(async (): Promise<void> => {
        setIsRetrying(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        setIsRetrying(false);
        resetErrorBoundary();
    }, [resetErrorBoundary]);

    const handleGoHome = useCallback((): void => {
        window.location.href = '/';
    }, []);

    const handleSecondaryAction = useCallback((): void => {
        if (resolvedErrorType === 'auth') {
            window.location.href = '/auth/login';
        } else if (resolvedErrorType === 'network') {
            window.location.reload();
        } else {
            window.location.href = '/';
        }
    }, [resolvedErrorType]);

    return (
        <div
            ref={errorContainerRef}
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
                    <pre className="text-sm text-neutral-600 overflow-auto whitespace-pre-wrap break-words max-h-24">
                        {error.message}
                    </pre>
                </div>

                <div className="flex justify-center gap-3">
                    <Button
                        variant="outline"
                        onClick={resolvedErrorType === 'auth' ? handleSecondaryAction : handleGoHome}
                        className="border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                        aria-label={resolvedErrorType === 'auth' ? messages.primaryAction : '홈으로 이동'}
                    >
                        <Home className="h-4 w-4 mr-2" />
                        <span>{resolvedErrorType === 'auth' ? messages.primaryAction : '홈으로'}</span>
                    </Button>
                    <Button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
                        aria-label="다시 시도"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                        <span>{isRetrying ? '재시도 중...' : messages.primaryAction}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};
