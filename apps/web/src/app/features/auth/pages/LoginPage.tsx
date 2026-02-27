import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { simpleWebCore, useSimpleWebCore } from '@chatic/web-core';

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
    } catch (error) {
        return null;
    }
};

export const LoginPage = (): JSX.Element => {
    const navigate = useNavigate();
    const { setIsAuthenticated, setProfile } = useSimpleWebCore();
    const { toast } = useToast();
    const {
        register,
        handleSubmit,
        formState: { errors },
        watch,
    } = useForm<LoginFormData>({
        defaultValues: {
            token: '',
        },
    });

    const tokenValue = watch('token');
    const decodedToken = tokenValue ? decodeJWT(tokenValue) : null;
    const isValidToken = tokenValue && decodedToken !== null;
    const showInvalidMessage = tokenValue && !isValidToken;

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

    return (
        <div className="h-full flex flex-col w-full mx-auto ">
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
