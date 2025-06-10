import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';

import type { ComponentType } from 'react';
import type { FallbackProps } from 'react-error-boundary';

export const ErrorFallback: ComponentType<FallbackProps> = ({ error, resetErrorBoundary }) => {
    return (
        <div className="min-h-screen relative overflow-hidden bg-lemon-cosmic animate-gradient flex items-center justify-center p-4">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-lemon-aurora animate-gradient opacity-30" />
            <div className="absolute top-20 left-20 w-64 h-64 bg-orange-500/10 dark:bg-orange-400/5 rounded-full blur-3xl animate-float" />
            <div
                className="absolute bottom-20 right-20 w-48 h-48 bg-yellow-500/10 dark:bg-yellow-400/5 rounded-full blur-3xl animate-float"
                style={{ animationDelay: '3s' }}
            />

            <Card className="relative z-10 w-full max-w-md p-8 space-y-6 glass-strong border-0">
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full mb-2">
                        <AlertTriangle className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-lemon-gradient">Oops! Something went wrong</h2>
                </div>

                <p className="text-center text-secondary-content leading-relaxed">
                    We apologize for the inconvenience. An unexpected error has occurred.
                </p>

                <div className="glass p-4 rounded-lg border border-white/10 dark:border-white/5">
                    <pre className="text-sm text-primary-content overflow-auto whitespace-pre-wrap break-words">
                        {error.message}
                    </pre>
                </div>

                <div className="flex justify-center pt-2">
                    <Button
                        onClick={resetErrorBoundary}
                        className="bg-lemon-gradient hover:opacity-90 text-white border-0 hover:scale-105 transition-transform duration-200"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        <span>Try again</span>
                    </Button>
                </div>
            </Card>
        </div>
    );
};
