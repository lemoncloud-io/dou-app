import { useNotificationsViewStore } from './useNotificationsViewStore';

describe('useNotificationsViewStore', () => {
    it('starts on all with the filter off, and keeps what was picked', () => {
        expect(useNotificationsViewStore.getState()).toMatchObject({ tab: 'all', unreadOnly: false });

        useNotificationsViewStore.getState().setTab('mention');
        useNotificationsViewStore.getState().setUnreadOnly(true);
        expect(useNotificationsViewStore.getState()).toMatchObject({ tab: 'mention', unreadOnly: true });
    });

    it('resets to all with the filter off', () => {
        useNotificationsViewStore.setState({ tab: 'thread', unreadOnly: true });

        useNotificationsViewStore.getState().reset();
        expect(useNotificationsViewStore.getState()).toMatchObject({ tab: 'all', unreadOnly: false });
    });
});
