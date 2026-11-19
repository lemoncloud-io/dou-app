import { renderHook } from '@testing-library/react';

import { logger } from '@chatic/bridges';

import { useVerifyEmailCode } from './useVerifyEmailCode';

const mutateAsync = jest.fn();
const verifyCloudEmail = jest.fn();

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({ cloud: { verifyCloudEmail } }),
        },
    })
);
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useCustomMutation: () => ({ mutateAsync }),
}));
jest.mock('../consts', () => ({ IS_DEV: false }));

const error = logger.error as jest.Mock;
const warn = logger.warn as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useVerifyEmailCode — 단계별 실패 기록 (ADR-0099)', () => {
    // All four legs share one hook and one endpoint — without a step, there's no telling where it broke.
    it('실패한 단계를 message와 data에 함께 남긴다', async () => {
        mutateAsync.mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useVerifyEmailCode());

        await expect(result.current({ email: 'a@b.c', step: 'check', code: '123456' })).rejects.toThrow('boom');

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][0]).toBe('ACCOUNT');
        expect(error.mock.calls[0][1]).toContain('step=check');
        expect(error.mock.calls[0][2]).toMatchObject({
            data: { step: 'check', hasCode: true, hasCloudId: false },
        });
    });

    it('이메일 주소는 엔트리에 싣지 않는다', async () => {
        mutateAsync.mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useVerifyEmailCode());

        await expect(result.current({ email: 'secret@user.test', step: 'send' })).rejects.toThrow();

        expect(JSON.stringify(error.mock.calls[0])).not.toContain('secret@user.test');
    });

    it('성공하면 아무것도 남기지 않는다', async () => {
        mutateAsync.mockResolvedValue({});
        const { result } = renderHook(() => useVerifyEmailCode());

        await expect(result.current({ email: 'a@b.c', step: 'send' })).resolves.toBeUndefined();

        expect(error).not.toHaveBeenCalled();
    });

    it('확정 단계는 cloudId 유무를 함께 남긴다', async () => {
        mutateAsync.mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useVerifyEmailCode());

        await expect(result.current({ email: 'a@b.c', step: 'confirm', cloudId: 'cloud_1' })).rejects.toThrow();

        expect(error.mock.calls[0][2]).toMatchObject({ data: { step: 'confirm', hasCloudId: true } });
    });

    it('files an address another user registered as a warn, not an error', async () => {
        mutateAsync.mockRejectedValue(new Error('409 CONFLICT - alias[x] is already registered'));
        const { result } = renderHook(() => useVerifyEmailCode());

        await expect(result.current({ email: 'a@b.c', step: 'send' })).rejects.toThrow('409 CONFLICT');

        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][1]).toContain('step=send');
    });

    it('keeps a 409 on confirm an error — a failed bind is a breakage', async () => {
        mutateAsync.mockRejectedValue(new Error('409 CONFLICT - alias[x] is already registered'));
        const { result } = renderHook(() => useVerifyEmailCode());

        await expect(result.current({ email: 'a@b.c', step: 'confirm', cloudId: 'c1' })).rejects.toThrow();

        expect(warn).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
    });
});
