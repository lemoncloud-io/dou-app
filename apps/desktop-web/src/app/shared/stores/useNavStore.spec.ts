import { beforeEach, describe, expect, it } from 'vitest';

import { useNavStore } from './useNavStore';

beforeEach(() => {
    useNavStore.setState({ active: 'home' });
});

describe('useNavStore', () => {
    it('starts on Home', () => {
        expect(useNavStore.getState().active).toBe('home');
    });

    it('moves to the destination it is sent to', () => {
        useNavStore.getState().go('notifications');
        expect(useNavStore.getState().active).toBe('notifications');

        useNavStore.getState().go('dm');
        expect(useNavStore.getState().active).toBe('dm');
    });
});
