import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/20 backdrop-blur-sm">
            <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                    {/* Main spinner */}
                    <div className="w-10 h-10 border-[3px] border-chatic-primary/20 border-t-chatic-primary rounded-full animate-spin"></div>
                    {/* Pulsing background circle */}
                    <div className="absolute inset-0 w-10 h-10 border border-chatic-primary/10 rounded-full animate-pulse"></div>
                </div>
            </div>
        </div>,
        document.body
    );
};
