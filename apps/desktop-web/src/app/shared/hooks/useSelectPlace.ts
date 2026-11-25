import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit';
import { runtime } from '@chatic/runtime';
import { serverErrorText, toastFailure } from '../utils';

export const useSelectPlace = () => {
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { switchSite, isSwitching } = runtime.session.useSiteSwitch();
    const { t } = useTranslation();
    const { toast } = useToast();

    const running = useRef<{ placeId: string; done: Promise<unknown> } | null>(null);
    const startSwitch = useCallback(
        (placeId: string): Promise<unknown> => {
            const entry = { placeId, done: Promise.resolve(switchSite(placeId)) };
            running.current = entry;
            const clear = () => {
                if (running.current === entry) running.current = null;
            };
            entry.done.then(clear, clear);
            return entry.done;
        },
        [switchSite]
    );

    const switchPlace = useCallback(
        (placeId: string, onFailed?: () => void): boolean => {
            if (isSwitching || placeId === selectedSiteId) return false;
            void startSwitch(placeId).catch((e: unknown) => {
                logger.error('SESSION', '[SelectPlace] switchFailed', {
                    error: e,
                    cause: serverErrorText(e),
                });
                toastFailure(t('place.switchFailed'), e);
                onFailed?.();
            });
            return true;
        },
        [startSwitch, selectedSiteId, isSwitching, t, toast]
    );

    const enterPlace = useCallback(
        async (placeId: string): Promise<void> => {
            if (running.current?.placeId === placeId) {
                await running.current.done;
                return;
            }
            if (placeId === selectedSiteId) return;
            await startSwitch(placeId);
        },
        [startSwitch, selectedSiteId]
    );

    return { switchPlace, enterPlace, isSwitching };
};
