import { type JSX, type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

const TOAST_MS = 2500;

const ToastContext = createContext<(message: ReactNode) => void>(() => undefined);

/** Shows one short message at the bottom of the screen at a time. */
export const ToastProvider = ({ children }: { children: ReactNode }): JSX.Element => {
    const [message, setMessage] = useState<ReactNode>(null);
    const show = useCallback((next: ReactNode) => setMessage(next), []);

    useEffect(() => {
        if (message === null) return;
        const timer = setTimeout(() => setMessage(null), TOAST_MS);
        return () => clearTimeout(timer);
    }, [message]);

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center">
                {message !== null && (
                    <div className="rounded-full bg-navy px-5 py-2.5 text-sm text-white shadow-lg animate-fadeIn">
                        {message}
                    </div>
                )}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = (): ((message: ReactNode) => void) => useContext(ToastContext);
