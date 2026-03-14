import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Loader2 } from 'lucide-react';

import { useGlobalLoader } from '../hooks';

export const GlobalLoader: React.FC = () => {
    const { isLoading, message } = useGlobalLoader();

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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
                {message && <p className="text-sm font-medium text-white/80">{message}</p>}
            </div>
        </div>,
        document.body
    );
};
