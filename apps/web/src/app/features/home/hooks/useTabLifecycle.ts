import { useEffect, useState } from 'react';

export interface TabLifecycleState {
    isVisible: boolean;
    isFocused: boolean;
    lastVisibilityChange: Date | null;
    lastFocusChange: Date | null;
}

export const useTabLifecycle = () => {
    const [state, setState] = useState<TabLifecycleState>({
        isVisible: !document.hidden,
        isFocused: document.hasFocus(),
        lastVisibilityChange: null,
        lastFocusChange: null,
    });

    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = !document.hidden;
            console.log('[TabLifecycle] Visibility changed:', isVisible ? 'visible' : 'hidden');
            setState(prev => ({
                ...prev,
                isVisible,
                lastVisibilityChange: new Date(),
            }));
        };

        const handleFocus = () => {
            console.log('[TabLifecycle] Window focused');
            setState(prev => ({
                ...prev,
                isFocused: true,
                lastFocusChange: new Date(),
            }));
        };

        const handleBlur = () => {
            console.log('[TabLifecycle] Window blurred');
            setState(prev => ({
                ...prev,
                isFocused: false,
                lastFocusChange: new Date(),
            }));
        };

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            console.log('[TabLifecycle] Before unload');
        };

        const handleUnload = () => {
            console.log('[TabLifecycle] Unload');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('unload', handleUnload);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('unload', handleUnload);
        };
    }, []);

    return state;
};
