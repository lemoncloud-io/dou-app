import { useEffect } from 'react';

interface ToastProps {
    message: string;
    visible: boolean;
    onClose: () => void;
}

export const Toast = ({ message, visible, onClose }: ToastProps): JSX.Element | null => {
    useEffect(() => {
        if (visible) {
            const timer = setTimeout(onClose, 2500);
            return () => clearTimeout(timer);
        }
    }, [visible, onClose]);

    if (!visible) return null;

    return (
        <div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50
                        px-6 py-3 bg-foreground text-background
                        rounded-xl shadow-lg text-sm font-medium
                        animate-fade-in"
        >
            {message}
        </div>
    );
};
