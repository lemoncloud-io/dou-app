/**
 * Contract tests for Track 0's `auth.verify-hash-alias` wrapper (ADR-0033 인터페이스 계약).
 *
 * What this hook actually decides is the packet body: which `step` a call maps to, and which send
 * switches reach the server. Both are invisible to its callers — `PhoneVerifyScreen` mocks this hook
 * — so a drift here (an `undefined` switch turning a delivery channel off, "extend" stopping to map
 * onto `resend`) would pass every other suite in the repo.
 */
import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useVerifyHashAlias } from './useVerifyHashAlias';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const sendPhoneVerification = jest.fn();
const checkPhoneVerification = jest.fn();

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        children
    );

const renderVerify = () => renderHook(() => useVerifyHashAlias(), { wrapper });

beforeEach(() => {
    jest.clearAllMocks();
    sendPhoneVerification.mockResolvedValue({ sent: true, expiredAt: 1_700_000_000_000 });
    checkPhoneVerification.mockResolvedValue({ attached: true });
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        auth: { sendPhoneVerification, checkPhoneVerification },
    });
});

// step=send/resend 파생과 "미지정 스위치는 키째 빼기"는 패킷의 계약이고
// AuthRemoteDataSource.test.ts가 검증한다. 여기서는 훅이 옵션을 손대지 않고 넘기는지만 본다.
describe('useVerifyHashAlias — send', () => {
    it('번호만 넘기면 옵션 없이 호출한다', async () => {
        const { result } = renderVerify();

        await result.current.send('01012345678');

        expect(sendPhoneVerification).toHaveBeenCalledWith('01012345678', undefined);
    });

    it('옵션을 해석하지 않고 그대로 전달한다 — resend·dev 스위치·초대 코드 전부', async () => {
        const { result } = renderVerify();

        await result.current.send('01012345678', { resend: true, sms: false, slack: true, code: 'invt:1:secret' });

        expect(sendPhoneVerification).toHaveBeenCalledWith('01012345678', {
            resend: true,
            sms: false,
            slack: true,
            code: 'invt:1:secret',
        });
    });

    it('응답의 expiredAt을 그대로 돌려준다 — 타이머의 유일한 근거다', async () => {
        sendPhoneVerification.mockResolvedValue({ sent: true, expiredAt: 1_800_000_000_000 });
        const { result } = renderVerify();

        await expect(result.current.send('01012345678')).resolves.toEqual({
            sent: true,
            expiredAt: 1_800_000_000_000,
        });
    });

    it('429(쿨다운·상한)는 호출자에게 reject된다 — 문구 분기는 에러코드로 한다', async () => {
        sendPhoneVerification.mockRejectedValue(new Error('429 TOO MANY REQUESTS'));
        const { result } = renderVerify();

        await expect(result.current.send('01012345678')).rejects.toThrow('429 TOO MANY REQUESTS');
    });
});

describe('useVerifyHashAlias — check', () => {
    it('번호·otp를 넘기고, 초대 코드가 없으면 code는 undefined다', async () => {
        const { result } = renderVerify();

        await result.current.check('01012345678', '123456');

        expect(checkPhoneVerification).toHaveBeenCalledWith('01012345678', '123456', { code: undefined });
    });

    it('초대 맥락의 check는 code를 함께 보낸다', async () => {
        const { result } = renderVerify();

        await result.current.check('01012345678', '123456', { code: 'invt:1:secret' });

        expect(checkPhoneVerification).toHaveBeenCalledWith('01012345678', '123456', { code: 'invt:1:secret' });
    });

    it('check 성공의 $token을 그대로 통과시킨다 — 세션 반영은 호출자(applySessionToken) 몫', async () => {
        checkPhoneVerification.mockResolvedValue({ attached: true, $token: { $auth: { id: 'user-1' } } });
        const { result } = renderVerify();

        await expect(result.current.check('01012345678', '123456')).resolves.toEqual({
            attached: true,
            $token: { $auth: { id: 'user-1' } },
        });
    });

    it('$token이 없으면 번호만 연결된 것이다 — 세션 불변, 그래도 성공이다', async () => {
        checkPhoneVerification.mockResolvedValue({ attached: true });
        const { result } = renderVerify();

        const checked = await result.current.check('01012345678', '123456');

        expect(checked.attached).toBe(true);
        expect(checked.$token).toBeUndefined();
    });

    it('403(오답)은 reject된다', async () => {
        checkPhoneVerification.mockRejectedValue(new Error('403 NOT ALLOWED'));
        const { result } = renderVerify();

        await expect(result.current.check('01012345678', '000000')).rejects.toThrow('403 NOT ALLOWED');
    });
});
