import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { useStackNavigate } from '../navigation';
import { ROUTES } from '../routes/paths';
import { usePendingInviteChannel } from '../stores/usePendingInviteChannel';

/**
 * Opens the room an accepted invite handed over, on whichever screen the reader lands once the accept
 * screen is gone.
 *
 * Both accept lanes stash the room in `usePendingInviteChannel` and leave the accept screen by the
 * stack's deeplink rule, which rewinds onto the entry underneath it. On a cold start that is home,
 * because the shell loads home before the link arrives. On a warm start it is the screen the reader
 * was on — My, place settings, a thread — except a room: the link itself arrived by the push rule,
 * which replaced the open room, so the rewind lands on whatever was under it.
 *
 * Mounted once, in the private layout, because the landing can be any private screen and an opener
 * on one of them would miss the rest — the id would sit in the store until that screen next mounted,
 * and the room would open out of nowhere. It lives in `app/hooks` rather than the invite feature
 * because the layout may not import a feature.
 *
 * The accept screen is a common route outside this layout, so the hook first runs on the landing
 * itself. The path check is a guard for the day that stops being true, not what keeps it waiting.
 *
 * The room is entered by the stack's push rule, the same as a push tap into a room: it stacks over
 * the screen the reader chose, and puts away another channel's settings or thread rather than
 * burying them under the new room. On a cold start the result is `[home, room]`, and back returns to
 * home.
 */
export const useOpenPendingInviteChannel = (): void => {
    const { pathname } = useLocation();
    const enterStack = useStackNavigate();
    const channelId = usePendingInviteChannel(state => state.channelId);

    useEffect(() => {
        if (!channelId || pathname === ROUTES.invite.accept) return;
        // Read the store, not the render's captured id. A second run over the same render — StrictMode
        // replays mount effects — would otherwise open the room again, and entering a room from
        // another channel's thread rewinds several entries, so a doubled entry over-rewinds.
        const pending = usePendingInviteChannel.getState();
        if (pending.channelId !== channelId) return;
        pending.clearPendingChannel();
        logger.info('INVITE', 'opening the invited room on landing', { channelId, landedOn: pathname });
        enterStack('push', ROUTES.channels.room(channelId));
    }, [channelId, pathname, enterStack]);
};
