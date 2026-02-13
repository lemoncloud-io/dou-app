import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { useWebSocketV2 } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { simpleWebCore, useSimpleWebCore } from '@chatic/web-core';

import type { JSX } from 'react';
import type { AuthPayload, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

type LoginFormData = {
    token: string;
};

export const LoginPage = (): JSX.Element => {
    const navigate = useNavigate();
    const { send, lastMessage } = useWebSocketV2();
    const { setIsAuthenticated } = useSimpleWebCore();
    const { toast } = useToast();
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>({
        defaultValues: {
            token: '',
        },
    });

    useEffect(() => {
        const message = lastMessage as WSSEnvelope<AuthPayload> | null;
        console.log(message);

        if (message?.type === 'auth' && message?.action === 'update') {
            const state = message.payload?.state;
            const member = message.payload?.member$;

            if (state === 'authenticated' && member) {
                setIsAuthenticated(true);
                toast({ title: '로그인 성공' });
                navigate('/');
            } else {
                toast({
                    title: '로그인 실패',
                    description: '토큰을 확인해 주세요',
                    variant: 'destructive',
                });
            }
        }
    }, [lastMessage, setIsAuthenticated, navigate, toast]);

    const onSubmit = async (data: LoginFormData) => {
        if (data.token.trim()) {
            simpleWebCore.saveToken(data.token.trim());

            send({
                type: 'auth',
                action: 'update',
                payload: {
                    token: data.token.trim(),
                    dryRun: true,
                },
            });
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-white max-w-[375px] mx-auto">
            <div className="flex-1 flex flex-col px-7 pt-28">
                <div className="flex flex-col items-center gap-2 mb-24">
                    <h1 className="text-2xl font-bold text-center leading-[1.35] tracking-[0.005em]">토큰 로그인</h1>
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
                    </div>
                </form>
            </div>

            <div className="flex flex-col px-4 pb-4">
                <Button
                    onClick={handleSubmit(onSubmit)}
                    className="w-full h-[50px] bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325] font-semibold text-base rounded-full"
                >
                    다음
                </Button>
            </div>
        </div>
    );
};
