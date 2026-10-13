import { useEffect } from 'react';

import { useChannelSettingsStore } from '../../channels';
import {
    useMentionsPanelStore,
    useMyThreadsPanelStore,
    useProfilePanelStore,
    useSavedPanelStore,
} from '../../../shared';
import { useThreadStore } from '../stores';

/**
 * The trailing pane's owners (thread, settings, profile, saved, activity, threads list) and the rule that keeps
 * them from sharing it. The host renders the profile above the rest, so this returns the raw state
 * and leaves the choice of panel to it.
 *
 * Thread, settings, saved, activity and the threads list are exclusive: opening any of them closes the others and the
 * profile, and the last one opened wins (each effect fires on its own opener only).
 *
 * The profile is the exception. It opens from inside another panel (a mention in a thread, a member
 * in the settings list) to check who someone is, so it stacks on that panel instead of replacing
 * it, and closing it shows the panel underneath again. It used to close the thread, and the reader
 * who stopped to check a name lost the conversation they were in.
 *
 * A thread belongs to the channel it was opened in. `shownChannelId` is the channel the pane is showing
 * right now (see `useHeldChannel`, which keeps it through a place switch); it is undefined when the list
 * has no such channel. The thread is handed out only while the two match. When they stop matching it is
 * closed, because the close runs in an effect after the render that first sees the new channel: without
 * the match a panel drawn in that render would ask the server about the old thread's number in the wrong
 * room.
 *
 * One mismatch is not a verdict: a thread opened while the list is still loading (the restored
 * selection is known before its channels are) has no channel to match yet. That is held — not drawn and
 * not closed — until the list answers; `listLoading` is that answer's absence. A list that has loaded
 * without the channel is a verdict and closes the thread.
 */
export const useTrailingPanelOwners = (shownChannelId: string | undefined, listLoading: boolean) => {
    const openRootId = useThreadStore(s => s.openRootId);
    const openChannelId = useThreadStore(s => s.openChannelId);
    const closeThread = useThreadStore(s => s.close);
    const threadHere = openRootId !== null && openChannelId === shownChannelId;
    const threadRootId = threadHere ? openRootId : null;
    const awaitingList = openRootId !== null && !threadHere && shownChannelId === undefined && listLoading;
    const settingsChannelId = useChannelSettingsStore(s => s.openChannelId);
    const closeSettings = useChannelSettingsStore(s => s.close);
    const profileTarget = useProfilePanelStore(s => s.target);
    const closeProfile = useProfilePanelStore(s => s.close);
    const savedOpen = useSavedPanelStore(s => s.isOpen);
    const closeSaved = useSavedPanelStore(s => s.close);
    const activityOpen = useMentionsPanelStore(s => s.isOpen);
    const closeActivity = useMentionsPanelStore(s => s.close);
    const threadsOpen = useMyThreadsPanelStore(s => s.isOpen);
    const closeThreads = useMyThreadsPanelStore(s => s.close);

    useEffect(() => {
        if (openRootId && !threadHere && !awaitingList) closeThread();
    }, [openRootId, threadHere, awaitingList, closeThread]);
    useEffect(() => {
        if (threadRootId) {
            closeSettings();
            closeProfile();
            closeSaved();
            closeActivity();
            closeThreads();
        }
    }, [threadRootId, closeSettings, closeProfile, closeSaved, closeActivity, closeThreads]);
    useEffect(() => {
        if (settingsChannelId) {
            closeThread();
            closeProfile();
            closeSaved();
            closeActivity();
            closeThreads();
        }
    }, [settingsChannelId, closeThread, closeProfile, closeSaved, closeActivity, closeThreads]);
    useEffect(() => {
        if (savedOpen) {
            closeThread();
            closeSettings();
            closeProfile();
            closeActivity();
            closeThreads();
        }
    }, [savedOpen, closeThread, closeSettings, closeProfile, closeActivity, closeThreads]);
    useEffect(() => {
        if (activityOpen) {
            closeThread();
            closeSettings();
            closeProfile();
            closeSaved();
            closeThreads();
        }
    }, [activityOpen, closeThread, closeSettings, closeProfile, closeSaved, closeThreads]);
    useEffect(() => {
        if (threadsOpen) {
            closeThread();
            closeSettings();
            closeProfile();
            closeSaved();
            closeActivity();
        }
    }, [threadsOpen, closeThread, closeSettings, closeProfile, closeSaved, closeActivity]);

    return { threadRootId, settingsChannelId, profileTarget, savedOpen, activityOpen, threadsOpen };
};
