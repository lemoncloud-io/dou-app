import { useEffect } from 'react';

import { useChannelSettingsStore } from '../../channels';
import { useMentionsPanelStore, useProfilePanelStore, useSavedPanelStore } from '../../../shared';
import { useThreadStore } from '../stores';

/**
 * The trailing pane's owners (thread, settings, profile, saved, activity) and the rule that keeps
 * them from sharing it. The host renders the profile above the rest, so this returns the raw state
 * and leaves the choice of panel to it.
 *
 * Thread, settings, saved and activity are exclusive: opening any of them closes the others and the
 * profile, and the last one opened wins (each effect fires on its own opener only).
 *
 * The profile is the exception. It opens from inside another panel (a mention in a thread, a member
 * in the settings list) to check who someone is, so it stacks on that panel instead of replacing
 * it, and closing it shows the panel underneath again. It used to close the thread, and the reader
 * who stopped to check a name lost the conversation they were in.
 */
export const useTrailingPanelOwners = () => {
    const threadRootId = useThreadStore(s => s.openRootId);
    const closeThread = useThreadStore(s => s.close);
    const settingsChannelId = useChannelSettingsStore(s => s.openChannelId);
    const closeSettings = useChannelSettingsStore(s => s.close);
    const profileTarget = useProfilePanelStore(s => s.target);
    const closeProfile = useProfilePanelStore(s => s.close);
    const savedOpen = useSavedPanelStore(s => s.isOpen);
    const closeSaved = useSavedPanelStore(s => s.close);
    const activityOpen = useMentionsPanelStore(s => s.isOpen);
    const closeActivity = useMentionsPanelStore(s => s.close);

    useEffect(() => {
        if (threadRootId) {
            closeSettings();
            closeProfile();
            closeSaved();
            closeActivity();
        }
    }, [threadRootId, closeSettings, closeProfile, closeSaved, closeActivity]);
    useEffect(() => {
        if (settingsChannelId) {
            closeThread();
            closeProfile();
            closeSaved();
            closeActivity();
        }
    }, [settingsChannelId, closeThread, closeProfile, closeSaved, closeActivity]);
    useEffect(() => {
        if (savedOpen) {
            closeThread();
            closeSettings();
            closeProfile();
            closeActivity();
        }
    }, [savedOpen, closeThread, closeSettings, closeProfile, closeActivity]);
    useEffect(() => {
        if (activityOpen) {
            closeThread();
            closeSettings();
            closeProfile();
            closeSaved();
        }
    }, [activityOpen, closeThread, closeSettings, closeProfile, closeSaved]);

    return { threadRootId, settingsChannelId, profileTarget, savedOpen, activityOpen };
};
