import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';

import type { ComponentType } from 'react';
import type { FallbackProps } from 'react-error-boundary';

export const ErrorFallback: ComponentType<FallbackProps> = ({ error, resetErrorBoundary }) => {
    return (
        <div className="min-h-screen bg-white flex items-center justify-center p-chatic-md">
            <Card className="w-full max-w-md p-chatic-lg space-y-chatic-md bg-white border border-chatic-neutral-200 rounded-chatic-sm shadow-sm">
                <div className="text-center space-y-chatic-md">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] rounded-full mb-2">
                        <AlertTriangle className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="text-chatic-3xl font-chatic-brand font-normal tracking-[-1.38px] bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text text-transparent">
                        오류가 발생했습니다
                    </h2>
                </div>

                <p className="text-center text-chatic-text-primary font-chatic text-chatic-md leading-relaxed">
                    죄송합니다. 예상치 못한 오류가 발생했습니다.
                </p>

                <div className="bg-chatic-neutral-50 p-chatic-md rounded-chatic-xs border border-chatic-neutral-200">
                    <pre className="text-chatic-sm text-chatic-text-tertiary font-chatic overflow-auto whitespace-pre-wrap break-words">
                        {error.message}
                    </pre>
                </div>

                <div className="flex justify-center pt-2">
                    <Button
                        onClick={resetErrorBoundary}
                        className="bg-chatic-text-accent hover:bg-chatic-text-accent/90 text-white border-0 px-chatic-md py-2 rounded-chatic-xs font-chatic text-chatic-base transition-all duration-200"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        <span>다시 시도</span>
                    </Button>
                </div>
            </Card>
        </div>
    );
};
