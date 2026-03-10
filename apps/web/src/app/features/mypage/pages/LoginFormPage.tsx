import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLogin } from '@chatic/auth';
import { fetchPlaces } from '@chatic/places';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { simpleWebCore } from '@chatic/web-core';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

export const LoginFormPage = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { mutateAsync: login, isPending } = useLogin();

    const [uid, setUid] = useState('');
    const [pwd, setPwd] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const {
                Token: { identityToken, credential },
            } = await login({ uid, pwd });
            simpleWebCore.saveToken(identityToken as string);
            if (credential) simpleWebCore.saveCredential(credential as AWSCredentials);

            const places = await fetchPlaces({});
            const firstPlace = places.list?.[0];
            if (firstPlace?.id) simpleWebCore.saveSelectedPlaceId(firstPlace.id);
            const wss = (firstPlace as unknown as Record<string, Record<string, string>>)?.$envs?.wss;
            if (wss) simpleWebCore.saveWsEndpoint(wss);

            window.location.href = '/';
        } catch {
            toast({
                title: '로그인 실패',
                description: '이메일 또는 비밀번호를 확인해주세요.',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-white px-4 pt-safe-top">
            <header className="flex items-center py-3">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M15 18L9 12L15 6"
                            stroke="#222325"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>
            </header>

            <div className="mt-6 mb-8">
                <h1 className="text-[20px] font-semibold leading-[1.35] text-black">로그인하기</h1>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-semibold text-[#53555B]">이메일</label>
                    <input
                        type="email"
                        value={uid}
                        onChange={e => setUid(e.target.value)}
                        placeholder="이메일을 입력해 주세요"
                        className="w-full rounded-[10px] border border-[#EAEAEC] px-3 py-3 text-[16px] text-[#222325] placeholder:text-[#BABCC0] outline-none focus:border-[#53555B]"
                        required
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-semibold text-[#53555B]">비밀번호</label>
                    <input
                        type="password"
                        value={pwd}
                        onChange={e => setPwd(e.target.value)}
                        placeholder="비밀번호를 입력해 주세요"
                        className="w-full rounded-[10px] border border-[#EAEAEC] px-3 py-3 text-[16px] text-[#222325] placeholder:text-[#BABCC0] outline-none focus:border-[#53555B]"
                        required
                    />
                </div>

                <div className="mt-4">
                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full rounded-[100px] bg-[#B0EA10] py-3 text-[16px] font-semibold text-[#222325] disabled:opacity-50"
                    >
                        {isPending ? '로그인 중...' : '로그인'}
                    </button>
                </div>
            </form>
        </div>
    );
};
