import { useEffect } from 'react';

import { useChannelSettingsStore } from '../../channels';
import { useProfilePanelStore, useSavedPageStore } from '../../../shared';
import { useThreadStore } from '../stores';

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
    const savedOpen = useSavedPageStore(s => s.isOpen);
    const closeSaved = useSavedPageStore(s => s.close);

    useEffect(() => {
        if (openRootId && !threadHere && !awaitingList) closeThread();
    }, [openRootId, threadHere, awaitingList, closeThread]);
    useEffect(() => {
        if (threadRootId) {
            closeSettings();
            closeProfile();
            closeSaved();
        }
    }, [threadRootId, closeSettings, closeProfile, closeSaved]);
    useEffect(() => {
        if (settingsChannelId) {
            closeThread();
            closeProfile();
            closeSaved();
        }
    }, [settingsChannelId, closeThread, closeProfile, closeSaved]);
    useEffect(() => {
        if (savedOpen) {
            closeThread();
            closeSettings();
            closeProfile();
        }
    }, [savedOpen, closeThread, closeSettings, closeProfile]);

    return { threadRootId, settingsChannelId, profileTarget, savedOpen };
};
