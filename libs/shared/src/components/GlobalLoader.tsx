import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Logo } from '@chatic/assets';

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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center">
                <div className="animate-pulse">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-md">
                        <img src={Logo.logo} alt="" className="h-12 w-12 object-contain" />
                    </div>
                </div>
                <div className="mt-5 flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:-0.3s]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce" />
                </div>
            </div>
        </div>,
        document.body
    );
};
