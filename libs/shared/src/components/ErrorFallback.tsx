import { useCallback, useEffect, useRef, useState } from 'react';

import { AlertTriangle, Home, RefreshCw, ServerCrash, ShieldOff, WifiOff } from 'lucide-react';

import { Logo } from '@chatic/assets';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { ERROR_MESSAGES } from '../consts';

import type { ComponentType, ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';

export type ErrorType = 'network' | 'auth' | 'server' | 'client' | 'unknown';

interface ErrorFallbackProps extends FallbackProps {
    errorType?: ErrorType;
}

const ERROR_ICONS: Record<ErrorType, ReactNode> = {
    network: <WifiOff className="h-8 w-8 text-muted-foreground" />,
    auth: <ShieldOff className="h-8 w-8 text-muted-foreground" />,
    server: <ServerCrash className="h-8 w-8 text-muted-foreground" />,
    client: <AlertTriangle className="h-8 w-8 text-muted-foreground" />,
    unknown: <AlertTriangle className="h-8 w-8 text-muted-foreground" />,
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
                        {error.message}
                    </pre>
                </div>
            </details>

            {/* Actions */}
            <div className="flex w-full max-w-[280px] flex-col gap-3">
                <Button
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className="h-[50px] w-full rounded-full bg-[#B0EA10] text-[16px] font-semibold text-[#222325] hover:bg-[#9DD00E] disabled:bg-muted disabled:text-muted-foreground"
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? '재시도 중...' : messages.primaryAction}
                </Button>
                <Button
                    variant="ghost"
                    onClick={handleSecondaryAction}
                    className="h-[44px] w-full rounded-full text-[14px] font-medium text-muted-foreground hover:text-foreground"
                >
                    <Home className="mr-2 h-4 w-4" />
                    {resolvedErrorType === 'auth' ? '로그인 페이지로' : messages.secondaryAction}
                </Button>
            </div>
        </div>
    );
};
