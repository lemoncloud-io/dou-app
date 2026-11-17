import { renderHook } from '@testing-library/react';

import { isEmailVerifyRefusal } from '../lib';
import { useCloudEmailGuard } from './useCloudEmailGuard';

const verifyEmailCode = jest.fn();
let clouds: { id: string; email?: string; status?: string }[] = [];

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../hooks/useCloudCatalog', () => ({ useClouds: () => ({ data: { list: clouds } }) }));
jest.mock('./useVerifyEmailCode', () => ({ useVerifyEmailCode: () => verifyEmailCode }));

beforeEach(() => {
    jest.clearAllMocks();
    clouds = [];
});

const caught = async (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
        () => undefined,
        e => e
    );

describe('useCloudEmailGuard', () => {
    it('refuses an address one of my clouds already holds, before sending', async () => {
        clouds = [{ id: 'c1', email: 'Mine@User.test', status: 'active' }];
        const { result } = renderHook(() => useCloudEmailGuard());

        const e = await caught(result.current({ email: 'mine@user.test', step: 'send' }));

        expect(isEmailVerifyRefusal(e) && e.message).toBe('addAccount.emailAlreadyUsed');
        expect(verifyEmailCode).not.toHaveBeenCalled();
    });

    it('turns the relay conflict for an address another user registered into its own message', async () => {
        verifyEmailCode.mockRejectedValue(
            new Error('409 CONFLICT - alias[taken@user.test] is already registered - verifyEmail(send/taken@user.test)')
        );
        const { result } = renderHook(() => useCloudEmailGuard());

        const e = await caught(result.current({ email: 'taken@user.test', step: 'send' }));

        expect(isEmailVerifyRefusal(e) && e.message).toBe('addAccount.emailAlreadyRegistered');
    });

    it('does the same on resend', async () => {
        verifyEmailCode.mockRejectedValue(new Error('409 CONFLICT - alias[x] is already registered'));
        const { result } = renderHook(() => useCloudEmailGuard());

        const e = await caught(result.current({ email: 'taken@user.test', step: 'resend' }));

        expect(isEmailVerifyRefusal(e) && e.message).toBe('addAccount.emailAlreadyRegistered');
    });

    it('leaves a 409 on check or confirm alone — the relay raises the duplicate on send only', async () => {
        const failure = new Error('409 CONFLICT - something else');
        verifyEmailCode.mockRejectedValue(failure);
        const { result } = renderHook(() => useCloudEmailGuard());

        expect(await caught(result.current({ email: 'a@user.test', step: 'check', code: '123456' }))).toBe(failure);
        expect(await caught(result.current({ email: 'a@user.test', step: 'confirm', cloudId: 'c1' }))).toBe(failure);
    });

    it('rethrows every other failure untouched, so the dialog keeps its generic copy', async () => {
        const failure = new Error('Request failed with status code 500');
        verifyEmailCode.mockRejectedValue(failure);
        const { result } = renderHook(() => useCloudEmailGuard());

        const e = await caught(result.current({ email: 'fresh@user.test', step: 'send' }));

        expect(e).toBe(failure);
        expect(isEmailVerifyRefusal(e)).toBe(false);
    });

    it('resolves when the request succeeds', async () => {
        verifyEmailCode.mockResolvedValue(undefined);
        const { result } = renderHook(() => useCloudEmailGuard());

        await expect(result.current({ email: 'fresh@user.test', step: 'send' })).resolves.toBeUndefined();
        expect(verifyEmailCode).toHaveBeenCalledWith({ email: 'fresh@user.test', step: 'send' });
    });
});
