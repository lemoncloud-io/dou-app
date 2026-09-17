import { renderHook } from '@testing-library/react';

import { logger } from '@chatic/bridges';

import { useVerifyEmailCode } from './useVerifyEmailCode';

const mutateAsync = jest.fn();
const verifyCloudEmail = jest.fn();

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ cloud: { verifyCloudEmail } }),
        },
    },
}));
jest.mock('@chatic/shared', () => ({ useCustomMutation: () => ({ mutateAsync }) }));
jest.mock('../consts', () => ({ IS_DEV: false }));

const error = logger.error as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useVerifyEmailCode — 단계별 실패 기록 (ADR-0099)', () => {
    // 네 다리가 한 훅·한 엔드포인트를 공유한다 — 단계가 없으면 어디가 끊겼는지 알 수 없다.
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
});
