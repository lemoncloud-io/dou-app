import { useCallback, useState } from 'react';

export const useToast = () => {
    const [toastKey, setToastKey] = useState(0);
    const [visible, setVisible] = useState(false);

    const show = useCallback(() => {
        setToastKey(prev => prev + 1);
        setVisible(true);
    }, []);

    const hide = useCallback(() => setVisible(false), []);

    return { toastKey, visible, show, hide } as const;
};
