import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    DOU_ENDPOINT,
    OAUTH_ENDPOINT,
    WS_ENDPOINT,
    loginWithInviteCode,
    simpleWebCore,
    useSimpleWebCore,
} from '@chatic/web-core';
import { LoadingFallback } from '@chatic/shared';

import type { JSX } from 'react';

type LoginFormData = {
    token: string;
};

const decodeJWT = (token: string) => {
    try {
        if (!token || token.split('.').length !== 3) {
            return null;
        }
        const base64Url = token.split('.')[1];
        if (!base64Url) {
            return null;
        }
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
};

export const TokenTestLoginPage = (): JSX.Element => {
    const location = useLocation();
    const { setIsAuthenticated, setProfile } = useSimpleWebCore();
    const { toast } = useToast();
    const [isInviteLogin, setIsInviteLogin] = useState(false);
    const inviteLoginCalled = useRef(false);
    const {
        register,
        handleSubmit,
        formState: { errors },
        watch,
        setValue,
    } = useForm<LoginFormData>({
        defaultValues: {
            token: '',
        },
    });

    // Handle invite login from deeplink
    useEffect(() => {
        if (inviteLoginCalled.current) {
            return;
        }

        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const provider = params.get('provider');

        if (code && provider === 'invite') {
            inviteLoginCalled.current = true;
            setIsInviteLogin(true);

            const handleInviteLogin = async () => {
                try {
                    const result = await loginWithInviteCode(code);
                    const identityToken = result.Token?.identityToken;

                    if (identityToken) {
                        // Set token in form for user to see
                        setValue('token', identityToken);
                        setIsInviteLogin(false);
                        toast({ title: '초대 토큰을 가져왔습니다. 다음 버튼을 눌러주세요.' });
                    } else {
                        throw new Error('No identityToken in response');
                    }
                } catch (error) {
                    console.error('[LoginPage] Invite login failed:', error);
                    toast({ title: '초대 로그인 실패', variant: 'destructive' });
                    setIsInviteLogin(false);
                }
            };

            handleInviteLogin();
        }
    }, [location.search, setValue, toast]);

    const tokenValue = watch('token');
    const decodedToken = tokenValue ? decodeJWT(tokenValue) : null;
    const isValidToken = tokenValue && decodedToken !== null;
    const showInvalidMessage = tokenValue && !isValidToken;

    // Show loading while processing invite login
    if (isInviteLogin) {
        return <LoadingFallback message="초대 로그인 중..." />;
    }

    const onSubmit = async (data: LoginFormData) => {
        if (data.token.trim()) {
            const decoded = decodeJWT(data.token.trim());

            if (decoded?.User) {
                setProfile({
                    id: decoded.uid,
                    name: decoded.User.name,
                    nick: decoded.User.nick,
                });
            }

            simpleWebCore.saveToken(data.token.trim());
            setIsAuthenticated(true);
            toast({ title: '로그인 성공' });
        }
    };

    // Debug: Show current endpoints
    const showDebug = import.meta.env.VITE_ENV !== 'PROD';

    return (
        <div className="h-full flex flex-col w-full mx-auto ">
            {/* Debug Panel */}
            {showDebug && (
                <div className="bg-gray-100 p-2 text-xs font-mono border-b space-y-0.5">
                    <div className="text-gray-500">OAUTH: {OAUTH_ENDPOINT || '(not set)'}</div>
                    <div className="text-gray-500">DOU: {DOU_ENDPOINT || '(not set)'}</div>
                    <div className="text-gray-500">WS: {WS_ENDPOINT || '(not set)'}</div>
                    <div className="text-gray-400 text-[10px]">
                        ls: {localStorage.getItem('CHATIC_OAUTH_ENDPOINT') || '-'} |{' '}
                        {localStorage.getItem('CHATIC_DOU_ENDPOINT') || '-'}
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col px-7 pt-28">
                <div className="flex flex-col items-center gap-2 mb-24">
                    <h1 className="text-2xl font-bold text-center leading-[1.35] tracking-[0.005em] text-black">
                        토큰 로그인
                    </h1>
                    <p className="text-sm text-[#53555B] text-center leading-[1.45] tracking-[0.005em]">
                        Identity Token을 입력해 주세요
                    </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1.5">
                        <Label
                            htmlFor="token"
                            className="text-xs font-medium text-[#9FA2A7] leading-[1.5em] tracking-[0.005em]"
                        >
                            Identity Token
                        </Label>
                        <Input
                            id="token"
                            type="text"
                            {...register('token', { required: '토큰을 입력해 주세요' })}
                            placeholder="토큰 입력"
                            className="h-11 px-3 text-base border-[#EAEAEC] rounded-[10px] bg-[#FEFEFE] leading-[1.45em] tracking-[-0.015em]"
                        />
                        {errors.token && <p className="text-xs text-destructive px-0.5">{errors.token.message}</p>}
                        {showInvalidMessage && (
                            <p className="text-xs text-destructive px-0.5">올바른 형식의 토큰이 아닙니다</p>
                        )}
                    </div>

                    {decodedToken && (
                        <div className="flex flex-col gap-2 p-3 bg-[#F4F5F5] rounded-lg">
                            <p className="text-xs font-medium text-[#9FA2A7]">디코딩된 정보</p>
                            <div className="flex flex-col gap-1 text-xs text-[#53555B]">
                                {decodedToken.User?.name && <p>이름: {decodedToken.User.name}</p>}
                                {decodedToken.User?.nick && <p>닉네임: {decodedToken.User.nick}</p>}
                                {decodedToken.uid && <p>UID: {decodedToken.uid}</p>}
                                {decodedToken.sid && <p>SID: {decodedToken.sid}</p>}
                            </div>
                        </div>
                    )}
                </form>
            </div>

            <div className="flex flex-col px-4 pb-4">
                <Button
                    onClick={handleSubmit(onSubmit)}
                    disabled={!isValidToken}
                    className="w-full h-[50px] bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325] font-semibold text-base rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    다음
                </Button>
            </div>
        </div>
    );
};
