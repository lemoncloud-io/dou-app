import { Loader2 } from 'lucide-react';

interface LoadingFallbackProps {
    message?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = '' }) => {
    return (
        <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
                {message && <div className="text-sm text-gray-600 text-center">{message}</div>}
            </div>
        </div>
    );
};
