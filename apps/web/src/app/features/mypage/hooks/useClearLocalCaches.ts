import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

export const useClearLocalCaches = (reload: () => void = () => window.location.reload()) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [isClearing, setIsClearing] = useState(false);

    const clearLocalCaches = async (): Promise<void> => {
        setIsClearing(true);
        try {
            const { failures } = await runtime.data.clearLocalCaches();
            if (failures === 0) {
                reload();
                return;
            }
        } catch {
            // Falls through to the same message — the runtime already logged which clear failed.
        }
        setIsClearing(false);
        toast({ title: t('mypage.clearCache.failed'), variant: 'destructive' });
    };

    return { clearLocalCaches, isClearing };
};
