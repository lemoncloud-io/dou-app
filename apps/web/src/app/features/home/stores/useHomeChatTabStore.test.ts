import { useHomeChatTabStore } from './useHomeChatTabStore';

describe('useHomeChatTabStore', () => {
    it('starts on all and keeps the tab that was picked', () => {
        expect(useHomeChatTabStore.getState().tab).toBe('all');

        useHomeChatTabStore.getState().setTab('dm');
        expect(useHomeChatTabStore.getState().tab).toBe('dm');
    });
});
