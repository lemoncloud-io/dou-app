import { type JSX, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, Home } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { ERROR_MESSAGES } from '../consts';

const messages = ERROR_MESSAGES.notFound;

export const NotFoundPage = (): JSX.Element => {
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const handleGoHome = useCallback((): void => {
        navigate('/');
    }, [navigate]);

    const handleGoBack = useCallback((): void => {
        navigate(-1);
    }, [navigate]);

    return (
        <div
            ref={containerRef}
            role="main"
            aria-labelledby="notfound-title"
            tabIndex={-1}
            className="min-h-screen bg-white flex items-center justify-center p-4 outline-none"
        >
            <div className="w-full max-w-md text-center space-y-8">
                <h1 className="text-8xl font-bold text-orange-500">404</h1>

                <div className="space-y-3">
                    <h2 id="notfound-title" className="text-2xl font-bold text-neutral-900">
                        {messages.title}
                    </h2>
                    <p className="text-neutral-500 leading-relaxed">{messages.description}</p>
                </div>

                <div className="flex justify-center gap-3 pt-4">
                    <Button
                        variant="outline"
                        onClick={handleGoBack}
                        className="border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                        aria-label={messages.secondaryAction}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        <span>{messages.secondaryAction}</span>
                    </Button>
                    <Button
                        onClick={handleGoHome}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                        aria-label={messages.primaryAction}
                    >
                        <Home className="h-4 w-4 mr-2" />
                        <span>{messages.primaryAction}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};
