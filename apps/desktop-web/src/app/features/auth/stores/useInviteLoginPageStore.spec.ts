import { beforeEach, describe, expect, it } from 'vitest';

import { useInviteLoginPageStore } from './useInviteLoginPageStore';

describe('useInviteLoginPageStore', () => {
    beforeEach(() => useInviteLoginPageStore.getState().release());

    it('drops a rejected code’s error as soon as the code is edited', () => {
        const store = useInviteLoginPageStore.getState();
        store.setCode('wrong');
        store.start();
        store.finish({ kind: 'server', message: 'expired' });
        expect(useInviteLoginPageStore.getState().error).toEqual({ kind: 'server', message: 'expired' });

        useInviteLoginPageStore.getState().setCode('wrong2');

        expect(useInviteLoginPageStore.getState()).toMatchObject({ code: 'wrong2', error: null, held: true });
    });

    it('keeps the error while the code is unchanged', () => {
        const store = useInviteLoginPageStore.getState();
        store.start();
        store.finish({ kind: 'server', message: 'expired' });

        expect(useInviteLoginPageStore.getState()).toMatchObject({
            error: { kind: 'server', message: 'expired' },
            done: false,
        });
    });
});
