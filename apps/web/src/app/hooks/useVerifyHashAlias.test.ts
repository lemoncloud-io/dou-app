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

import { useRuntimeGateways } from '@chatic/app-runtime';

import { useVerifyHashAlias } from './useVerifyHashAlias';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeGateways: jest.fn() }));

const verifyHashAlias = jest.fn();

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        children
    );

const renderVerify = () => renderHook(() => useVerifyHashAlias(), { wrapper });

beforeEach(() => {
    jest.clearAllMocks();
    verifyHashAlias.mockResolvedValue({ sent: true, expiredAt: 1_700_000_000_000 });
    (useRuntimeGateways as jest.Mock).mockReturnValue({ auth: { verifyHashAlias } });
});

describe('useVerifyHashAlias — send', () => {
    it('첫 발송은 step=send이고 스위치를 하나도 싣지 않는다', async () => {
        const { result } = renderVerify();

        await result.current.send('01012345678');

        expect(verifyHashAlias).toHaveBeenCalledWith({ kind: 'phone', step: 'send', phone: '01012345678' });
    });

    it('미지정 스위치는 키 자체가 빠진다 — 명시적 false는 채널을 끄기 때문', async () => {
        const { result } = renderVerify();

        await result.current.send('01012345678', { dryRun: true });

        const body = verifyHashAlias.mock.calls[0][0];
        expect(body).toEqual({ kind: 'phone', step: 'send', phone: '01012345678', dryRun: true });
        expect('sms' in body).toBe(false);
        expect('slack' in body).toBe(false);
    });

    it('resend:true는 step=resend로 바뀌고 resend 키는 body에 남지 않는다', async () => {
        const { result } = renderVerify();

        await result.current.send('01012345678', { resend: true });

        const body = verifyHashAlias.mock.calls[0][0];
        expect(body.step).toBe('resend');
        expect('resend' in body).toBe(false);
    });

    it('"시간 연장"도 재전송이다(ADR-0033 D9) — 연장 전용 step은 없다', async () => {
        const { result } = renderVerify();

        // UI의 "인증 요청"과 "시간 연장"이 서로 다른 step을 부르지 않는다는 계약.
        await result.current.send('01012345678');
        await result.current.send('01012345678', { resend: true });

        expect(verifyHashAlias.mock.calls.map(([body]) => body.step)).toEqual(['send', 'resend']);
    });

    it('초대 맥락이면 code를 동봉한다 — 번호 불일치는 발송단에서 400으로 걸린다', async () => {
        const { result } = renderVerify();

        await result.current.send('01012345678', { code: 'invt:1:secret' });

        expect(verifyHashAlias).toHaveBeenCalledWith(expect.objectContaining({ step: 'send', code: 'invt:1:secret' }));
    });

    it('dev 발송 스위치(sms=false, slack=true)는 그대로 전달된다', async () => {
        const { result } = renderVerify();

        await result.current.send('01012345678', { sms: false, slack: true });

        expect(verifyHashAlias).toHaveBeenCalledWith(expect.objectContaining({ sms: false, slack: true }));
    });

    it('응답의 expiredAt을 그대로 돌려준다 — 타이머의 유일한 근거다', async () => {
        verifyHashAlias.mockResolvedValue({ sent: true, expiredAt: 1_800_000_000_000 });
        const { result } = renderVerify();

        await expect(result.current.send('01012345678')).resolves.toEqual({
            sent: true,
            expiredAt: 1_800_000_000_000,
        });
    });

    it('429(쿨다운·상한)는 호출자에게 reject된다 — 문구 분기는 에러코드로 한다', async () => {
        verifyHashAlias.mockRejectedValue(new Error('429 TOO MANY REQUESTS'));
        const { result } = renderVerify();

        await expect(result.current.send('01012345678')).rejects.toThrow('429 TOO MANY REQUESTS');
    });
});

describe('useVerifyHashAlias — check', () => {
    it('step=check로 otp를 보내고, 초대 코드가 없으면 code는 undefined다', async () => {
        verifyHashAlias.mockResolvedValue({ attached: true });
        const { result } = renderVerify();

        await result.current.check('01012345678', '123456');

        expect(verifyHashAlias).toHaveBeenCalledWith({
            kind: 'phone',
            step: 'check',
            phone: '01012345678',
            otp: '123456',
            code: undefined,
        });
    });

    it('초대 맥락의 check는 code를 함께 보낸다', async () => {
        verifyHashAlias.mockResolvedValue({ attached: true });
        const { result } = renderVerify();

        await result.current.check('01012345678', '123456', { code: 'invt:1:secret' });

        expect(verifyHashAlias).toHaveBeenCalledWith(expect.objectContaining({ code: 'invt:1:secret' }));
    });

    it('check 성공의 $token을 그대로 통과시킨다 — 세션 반영은 호출자(applySessionToken) 몫', async () => {
        verifyHashAlias.mockResolvedValue({ attached: true, $token: { $auth: { id: 'user-1' } } });
        const { result } = renderVerify();

        await expect(result.current.check('01012345678', '123456')).resolves.toEqual({
            attached: true,
            $token: { $auth: { id: 'user-1' } },
        });
    });

    it('$token이 없으면 번호만 연결된 것이다 — 세션 불변, 그래도 성공이다', async () => {
        verifyHashAlias.mockResolvedValue({ attached: true });
        const { result } = renderVerify();

        const checked = await result.current.check('01012345678', '123456');

        expect(checked.attached).toBe(true);
        expect(checked.$token).toBeUndefined();
    });

    it('403(오답)은 reject된다', async () => {
        verifyHashAlias.mockRejectedValue(new Error('403 NOT ALLOWED'));
        const { result } = renderVerify();

        await expect(result.current.check('01012345678', '000000')).rejects.toThrow('403 NOT ALLOWED');
    });
});
