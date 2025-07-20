
interface LoadingFallbackProps {
    message?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = 'Loading...' }) => {
    return (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-white via-chatic-neutral-50/50 to-white">
            <div className="flex items-center justify-center min-h-screen p-6">
                <div className="bg-white/80 backdrop-blur-2xl p-12 rounded-3xl border-0 shadow-2xl shadow-chatic-primary/5 text-center max-w-md">
                    <div className="flex flex-col items-center space-y-8">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-chatic-primary/20 border-t-chatic-primary rounded-full animate-spin"></div>
                            <div className="absolute inset-0 w-16 h-16 border-2 border-chatic-primary/10 rounded-full animate-pulse"></div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-xl font-chatic-brand font-medium tracking-tight bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text text-transparent">
                                {message}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
