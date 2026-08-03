/**
 * Contract tests for Track 0's `auth.attach-social` wrapper (ADR-0033 인터페이스 계약).
 *
 * The load-bearing property is what this hook does NOT do: the token bundle passes through
 * untouched (which field carries the credential is provider-specific — Apple uses `identityToken`),
 * and nothing about the session is rewritten, because attaching is not a login.
 */
import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useAttachSocial } from './useAttachSocial';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const attachSocial = jest.fn();

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        children
    );

const renderAttach = () => renderHook(() => useAttachSocial(), { wrapper });

beforeEach(() => {
    jest.clearAllMocks();
    attachSocial.mockResolvedValue({ attached: true });
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ auth: { attachSocial } });
});

describe('useAttachSocial', () => {
    it('토큰 번들을 손대지 않고 그대로 보낸다 — 자격증명 필드는 provider마다 다르다', async () => {
        const { result } = renderAttach();

        await result.current.attach({ provider: 'apple', identityToken: 'tok', authorizationCode: 'code' });

        expect(attachSocial).toHaveBeenCalledWith({
            provider: 'apple',
            identityToken: 'tok',
            authorizationCode: 'code',
        });
    });

    it('google 번들도 같은 경로다 — 훅은 provider를 해석하지 않는다', async () => {
        const { result } = renderAttach();

        await result.current.attach({ provider: 'google', idToken: 'tok' });

        expect(attachSocial).toHaveBeenCalledWith({ provider: 'google', idToken: 'tok' });
    });

    it('응답을 그대로 돌려준다 — 세션 토큰이 없다(로그인이 아니다)', async () => {
        const { result } = renderAttach();

        const attached = await result.current.attach({ provider: 'google', idToken: 'tok' });

        expect(attached).toEqual({ attached: true });
        expect(attached).not.toHaveProperty('$token');
    });

    it('409(이미 다른 유저 소유)는 reject된다 — 문구 분기는 에러코드로 한다', async () => {
        attachSocial.mockRejectedValue(new Error('409 CONFLICT'));
        const { result } = renderAttach();

        await expect(result.current.attach({ provider: 'google', idToken: 'tok' })).rejects.toThrow('409 CONFLICT');
    });

    it('403(메인유저가 아님)도 reject된다', async () => {
        attachSocial.mockRejectedValue(new Error('403 NOT ALLOWED'));
        const { result } = renderAttach();

        await expect(result.current.attach({ provider: 'google', idToken: 'tok' })).rejects.toThrow('403 NOT ALLOWED');
    });
});
