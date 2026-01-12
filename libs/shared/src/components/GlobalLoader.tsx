import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Loader2 } from 'lucide-react';

import { useGlobalLoader } from '../hooks';

export const GlobalLoader: React.FC = () => {
    const { isLoading } = useGlobalLoader();

    useEffect(() => {
        if (isLoading) {
            document.body.classList.add('overflow-hidden');
        } else {
            document.body.classList.remove('overflow-hidden');
        }

        return () => {
            document.body.classList.remove('overflow-hidden');
        };
    }, [isLoading]);

    if (!isLoading) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm">
            <div className="glass-strong p-8 rounded-2xl border-0">
                <div className="flex flex-col items-center space-y-4">
                    <div className="relative">
                        <Loader2 className="h-12 w-12 animate-spin text-orange-500 dark:text-orange-400" />
                        <div className="absolute inset-0 h-12 w-12 animate-ping text-orange-500/30 dark:text-orange-400/30">
                            <Loader2 className="h-12 w-12" />
                        </div>
                    </div>
                    <div className="text-primary-content font-medium">Loading...</div>
                </div>
            </div>
        </div>,
        document.body
    );
};
