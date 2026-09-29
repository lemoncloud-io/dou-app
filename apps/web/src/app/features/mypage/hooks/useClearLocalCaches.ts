import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

/**
 * Settings' "clear cache": empties every known cloud's local cache except invited clouds and invite
 * dismissals (see `runtime.data.clearLocalCaches`), then reloads.
 *
 * The reload is what makes the clear visible. Screens still hold the rows they already read, and
 * react-query holds its own copy in memory, so without it the app would keep showing the old data
 * until each screen happened to refetch. A fresh document asks the server for everything.
 *
 * A partial failure does not reload: the error toast would be gone with the document, and the person
 * needs to know to try again — a retry repeats the whole sweep, cursors included.
 */
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
