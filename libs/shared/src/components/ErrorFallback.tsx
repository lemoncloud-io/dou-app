import { AlertTriangle, RefreshCw } from 'lucide-react';

import type { ComponentType } from 'react';
import type { FallbackProps } from 'react-error-boundary';

export const ErrorFallback: ComponentType<FallbackProps> = ({ error, resetErrorBoundary }) => {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">오류가 발생했습니다</h2>
                </div>

                <p className="text-center text-gray-600 text-sm">
                    예상치 못한 오류가 발생했습니다. 다시 시도해 주세요.
                </p>

                <div className="bg-gray-50 p-3 rounded border text-xs text-gray-700 overflow-auto">
                    <pre className="whitespace-pre-wrap break-words">{error.message}</pre>
                </div>

                <div className="flex justify-center">
                    <button
                        onClick={resetErrorBoundary}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        다시 시도
                    </button>
                </div>
            </div>
        </div>
    );
};
