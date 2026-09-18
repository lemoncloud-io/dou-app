import { logger } from '@chatic/bridges';

import { findAlias, verifyAlias } from '../../auth/authActions';
import type { VerifyAliasBody } from '../../auth/authActions';
import { useFindAlias } from './useFindAlias';
import { useVerifyAlias } from './useVerifyAlias';

/**
 * The two hooks are one-line wrappers around a mutation, so the only thing worth testing is what
 * they record on failure — and that they record neither the address, the code nor the password
 * (ADR-0099).
 *
 * `useCustomMutation` is stubbed to hand back the mutation function itself: driving these through a
 * real react-query client would test react-query, not the entries.
 */
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/shared', () => ({
    useCustomMutation: (mutationFn: unknown) => mutationFn,
}));
jest.mock('../../auth/authActions', () => ({
    verifyAlias: jest.fn(),
    findAlias: jest.fn(),
}));

const error = logger.error as jest.Mock;
const verifyMock = verifyAlias as jest.Mock;
const findMock = findAlias as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useVerifyAlias — 계정 이메일 검증 실패 기록', () => {
    // Typed as the production body, not `as const` literals: the second case varies `step` to
    // 'change' and adds a password, and a `typeof body` cast would have pinned `step` to 'check'.
    const body: VerifyAliasBody = {
        type: 'email',
        mode: 'signup',
        step: 'check',
        alias: 'someone@user.test',
        code: '123456',
    };

    // One endpoint doubles for two journeys × five steps — without mode/step, there's no telling
    // which leg broke.
    it('mode와 step을 message와 data에 함께 남긴다', async () => {
        verifyMock.mockRejectedValue(new Error('boom'));
        const run = useVerifyAlias() as unknown as (b: VerifyAliasBody) => Promise<unknown>;

        await expect(run(body)).rejects.toThrow('boom');

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][0]).toBe('ACCOUNT');
        expect(error.mock.calls[0][1]).toContain('mode=signup');
        expect(error.mock.calls[0][1]).toContain('step=check');
        expect(error.mock.calls[0][2].data).toEqual({
            mode: 'signup',
            step: 'check',
            hasCode: true,
            hasPassword: false,
        });
    });

    it('주소·코드·비밀번호를 엔트리에 싣지 않는다', async () => {
        verifyMock.mockRejectedValue(new Error('boom'));
        const run = useVerifyAlias() as unknown as (b: VerifyAliasBody) => Promise<unknown>;

        await expect(run({ ...body, step: 'change', password: 'hunter2' })).rejects.toThrow();

        const serialized = JSON.stringify(error.mock.calls[0]);
        expect(serialized).not.toContain('someone@user.test');
        expect(serialized).not.toContain('123456');
        expect(serialized).not.toContain('hunter2');
        expect(error.mock.calls[0][2].data.hasPassword).toBe(true);
    });

    it('성공하면 아무것도 남기지 않는다', async () => {
        verifyMock.mockResolvedValue({});
        const run = useVerifyAlias() as unknown as (b: VerifyAliasBody) => Promise<unknown>;

        await expect(run(body)).resolves.toEqual({});
        expect(error).not.toHaveBeenCalled();
    });
});

describe('useFindAlias — 계정 조회 실패 기록', () => {
    const body = { type: 'email' as const, alias: 'someone@user.test' };

    it('실패를 ACCOUNT로 남긴다', async () => {
        findMock.mockRejectedValue(new Error('boom'));
        const run = useFindAlias() as unknown as (b: typeof body) => Promise<unknown>;

        await expect(run(body)).rejects.toThrow('boom');
        expect(error.mock.calls[0][0]).toBe('ACCOUNT');
        expect(error.mock.calls[0][2].data).toEqual({ type: 'email' });
    });

    // 계정 존재 여부는 열거 공격이 노리는 바로 그 사실이다.
    it('주소도 조회 결과도 싣지 않는다', async () => {
        findMock.mockRejectedValue(new Error('boom'));
        const run = useFindAlias() as unknown as (b: typeof body) => Promise<unknown>;

        await expect(run(body)).rejects.toThrow();
        expect(JSON.stringify(error.mock.calls[0])).not.toContain('someone@user.test');
    });

    it('성공하면 아무것도 남기지 않는다', async () => {
        findMock.mockResolvedValue({ hasUser: true });
        const run = useFindAlias() as unknown as (b: typeof body) => Promise<unknown>;

        await expect(run(body)).resolves.toEqual({ hasUser: true });
        expect(error).not.toHaveBeenCalled();
    });
});
