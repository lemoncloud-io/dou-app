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

    describe('the two-step join', () => {
        const pending = { code: 'invt:1:abc', info: null, createdGuest: true, placeName: 'Design Team' };

        it('moves from paste to preview with the guest it registered remembered', () => {
            const attempt = useInviteLoginPageStore.getState().start();
            useInviteLoginPageStore.getState().resolvePreview(attempt, { preview: pending });

            expect(useInviteLoginPageStore.getState()).toMatchObject({
                step: 'preview',
                preview: pending,
                createdGuest: true,
                isSubmitting: false,
                held: true,
            });
        });

        it('stays on paste and keeps a registered guest when the preview is blocked', () => {
            const attempt = useInviteLoginPageStore.getState().start();
            useInviteLoginPageStore.getState().resolvePreview(attempt, {
                error: { kind: 'used' },
                createdGuest: true,
            });

            expect(useInviteLoginPageStore.getState()).toMatchObject({
                step: 'paste',
                preview: null,
                error: { kind: 'used' },
                createdGuest: true,
            });
        });

        it('drops a preview that resolves after the person went back', () => {
            const attempt = useInviteLoginPageStore.getState().start();
            useInviteLoginPageStore.getState().backToPaste();

            useInviteLoginPageStore.getState().resolvePreview(attempt, { preview: pending });

            expect(useInviteLoginPageStore.getState()).toMatchObject({ step: 'paste', preview: null });
        });

        it('returns to the preview with the error when the exchange is rejected', () => {
            const attempt = useInviteLoginPageStore.getState().start();
            useInviteLoginPageStore.getState().resolvePreview(attempt, { preview: pending });
            useInviteLoginPageStore.getState().beginEnter();
            expect(useInviteLoginPageStore.getState()).toMatchObject({ step: 'entering', isSubmitting: true });

            useInviteLoginPageStore.getState().finish({ kind: 'server', message: 'used' });

            expect(useInviteLoginPageStore.getState()).toMatchObject({
                step: 'preview',
                isSubmitting: false,
                done: false,
                error: { kind: 'server', message: 'used' },
            });
        });

        it('does not let a lookup from before a release match the attempt of a later paste', () => {
            const stale = useInviteLoginPageStore.getState().start();
            useInviteLoginPageStore.getState().release();
            const fresh = useInviteLoginPageStore.getState().start();

            useInviteLoginPageStore.getState().resolvePreview(stale, { preview: pending });

            expect(fresh).not.toBe(stale);
            expect(useInviteLoginPageStore.getState()).toMatchObject({ step: 'paste', preview: null });
        });

        it('forgets the guest it registered once released', () => {
            const attempt = useInviteLoginPageStore.getState().start();
            useInviteLoginPageStore.getState().resolvePreview(attempt, { preview: pending });

            useInviteLoginPageStore.getState().release();

            expect(useInviteLoginPageStore.getState()).toMatchObject({
                step: 'paste',
                preview: null,
                createdGuest: false,
                held: false,
            });
        });
    });
});
