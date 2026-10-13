import { beforeEach, describe, expect, it } from 'vitest';

import { saveSignInNotice } from '../utils/signInNotice';
import { selectNewAccountPending, useSignInNoticeStore } from './useSignInNoticeStore';

describe('useSignInNoticeStore', () => {
    beforeEach(() => {
        sessionStorage.clear();
        useSignInNoticeStore.setState({ notice: null });
    });

    it('picks up a notice left in storage, once', () => {
        saveSignInNotice({ provider: 'google', isNew: true });

        useSignInNoticeStore.getState().pick();
        useSignInNoticeStore.getState().pick();

        expect(useSignInNoticeStore.getState().notice).toEqual({ provider: 'google', isNew: true });
        expect(selectNewAccountPending(useSignInNoticeStore.getState())).toBe(true);
    });

    it('holds nothing back for an existing account, or once cleared', () => {
        saveSignInNotice({ provider: 'google', isNew: false });
        useSignInNoticeStore.getState().pick();
        expect(selectNewAccountPending(useSignInNoticeStore.getState())).toBe(false);

        useSignInNoticeStore.setState({ notice: { provider: 'google', isNew: true } });
        useSignInNoticeStore.getState().clear();
        expect(selectNewAccountPending(useSignInNoticeStore.getState())).toBe(false);
    });

    it('hands a notice over to one take only', () => {
        useSignInNoticeStore.setState({ notice: { provider: 'google', isNew: false } });

        expect(useSignInNoticeStore.getState().take()).toEqual({ provider: 'google', isNew: false });
        expect(useSignInNoticeStore.getState().take()).toBeNull();
    });
});
