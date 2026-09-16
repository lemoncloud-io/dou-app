import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { runtime } from '@chatic/app-runtime';

/**
 * Switch the active place. The place IS the session's selected site, so this just forwards to
 * the engine's `switchSite`, which optimistically pre-applies the sid (cached channels swap
 * instantly), moves the live socket session with SDK `auth.switch`, and rolls the sid back on
 * failure — no app-side loader or manual rollback. Mirrors apps/web `useSwitchPlace`.
 * `isSwitching` is exposed so the rail can disable the place tiles during a switch.
 *
 * The socket half is the whole point, and the import is load-bearing: `@chatic/web-core` exports
 * a hook of the same name that re-issues only the HTTP token. Channels come over the socket, so
 * under that one the server kept answering for the previous place and the sidebar read empty
 * (.claude/20260804/DEBUG-14-20-13.md).
 */
export const useSelectPlace = () => {
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { switchSite, isSwitching } = runtime.session.useSiteSwitch();
    const { t } = useTranslation();
    const { toast } = useToast();

    const switchPlace = useCallback(
        (placeId: string) => {
            if (isSwitching || placeId === selectedSiteId) return;
            // switchSite rolls its own sid back on failure, but said nothing about
            // it: the tile click simply did nothing, while the cloud rail toasts on
            // the same class of failure. Say it, the way the cloud rail does.
            // `Promise.resolve` because switchSite is not guaranteed to return one.
            void Promise.resolve(switchSite(placeId)).catch((e: unknown) => {
                logger.error('SESSION', '[SelectPlace] switchFailed', { error: e });
                toast({ title: t('place.switchFailed'), variant: 'destructive' });
            });
        },
        [switchSite, selectedSiteId, isSwitching, t, toast]
    );

    return { switchPlace, isSwitching };
};
