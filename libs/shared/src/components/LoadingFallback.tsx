import { Loader2 } from 'lucide-react';

interface LoadingFallbackProps {
    message?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = '' }) => {
    return (
        <div className="fixed inset-0 z-50 bg-lemon-cosmic animate-gradient">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-lemon-aurora animate-gradient opacity-40" />
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-orange-500/15 dark:bg-orange-400/10 rounded-full blur-xl animate-float" />
            <div
                className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-yellow-500/15 dark:bg-yellow-400/10 rounded-full blur-xl animate-float"
                style={{ animationDelay: '2s' }}
            />

            <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
                <div className="glass-strong p-8 rounded-2xl border-0 text-center max-w-sm">
                    <div className="flex flex-col items-center space-y-6">
                        <div className="relative">
                            <Loader2 className="h-16 w-16 animate-spin text-orange-500 dark:text-orange-400" />
                            <div className="absolute inset-0 h-16 w-16 animate-ping text-orange-500/30 dark:text-orange-400/30">
                                <Loader2 className="h-16 w-16" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-xl font-bold text-lemon-gradient">{message}</div>
                            <div className="text-sm text-secondary-content">Please wait a moment...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
