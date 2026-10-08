import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { runtime } from '@chatic/app-runtime';

/**
 * Switch the active place. The place IS the session's selected site, so this just forwards to
 * the engine's `switchSite`, which optimistically pre-applies the sid (cached channels swap
 * instantly), moves the live socket session with SDK `auth.switch`, and rolls the sid back on
 * failure — no app-side loader or manual rollback. Mirrors apps/web `useSwitchPlace`.
 * `isSwitching` is exposed so the rail can disable the place tiles during a switch. `switchPlace`
 * returns whether it started one: a request made mid-switch, or for the current place, is ignored.
 * `onFailed` runs when a switch it started fails (after the engine rolled the place back), for a caller
 * that was waiting on that place.
 *
 * The socket half is the whole point, and the import is load-bearing: `@chatic/web-core` exports
 * a hook of the same name that re-issues only the HTTP token. Channels come over the socket, so
 * under that one the server kept answering for the previous place and the sidebar read empty.
 */
export const useSelectPlace = () => {
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { switchSite, isSwitching } = runtime.session.useSiteSwitch();
    const { t } = useTranslation();
    const { toast } = useToast();

    // The switch that is running, so a second request for the same place joins it instead of
    // sending another. `isSwitching` cannot do this: it only turns true on the next render.
    const running = useRef<{ placeId: string; done: Promise<unknown> } | null>(null);
    const startSwitch = useCallback(
        (placeId: string): Promise<unknown> => {
            // `Promise.resolve` because switchSite is not guaranteed to return one.
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
            // switchSite rolls its own sid back on failure, but said nothing about
            // it: the tile click simply did nothing, while the cloud rail toasts on
            // the same class of failure. Say it, the way the cloud rail does.
            void startSwitch(placeId).catch((e: unknown) => {
                logger.error('SESSION', '[SelectPlace] switchFailed', { error: e });
                toast({ title: t('place.switchFailed'), variant: 'destructive' });
                onFailed?.();
            });
            return true;
        },
        [startSwitch, selectedSiteId, isSwitching, t, toast]
    );

    // The same switch for a caller that has to wait for it and deal with a failure itself — a place
    // just created has to be entered before anything is written into it. It goes through this hook
    // rather than a `useSiteSwitch` of the caller's own because `isSwitching` belongs to one
    // mutation observer: a switch started elsewhere would leave the rail unlocked while it ran.
    //
    // The place may already be on its way in. A cloud with no place yet auto-selects the first one
    // to appear, and a new place appears in the cache before its create call returns — so by the
    // time the creator asks to enter it, that switch can be running or done. Joining a running one
    // keeps one `auth.switch` on the wire for one place. A finished one is skipped when this render
    // already has the new sid; a caller holding an older `enterPlace` gets past that check, and the
    // engine's own "already in this site" return is what keeps it off the wire.
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
