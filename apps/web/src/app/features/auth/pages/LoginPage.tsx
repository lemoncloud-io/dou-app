import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { useLogin } from '@chatic/auth';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useSimpleWebCore } from '@chatic/web-core';

import type { JSX } from 'react';

type LoginFormData = {
    uid: string;
    pwd: string;
};

export const LoginPage = (): JSX.Element => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { mutateAsync: login, isPending } = useLogin();
    const { setProfile } = useSimpleWebCore();
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>({
        defaultValues: {
            uid: '',
            pwd: '',
        },
    });

    const onSubmit = async (data: LoginFormData) => {
        try {
            const user = await login(data);
            setProfile(user);
            navigate('/');
        } catch (error) {
            toast({
                title: '로그인 실패',
                description: '아이디 또는 비밀번호를 확인해 주세요',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-white max-w-[375px] mx-auto">
            <div className="flex-1 flex flex-col px-7 pt-28">
                <div className="flex flex-col items-center gap-2 mb-24">
                    <h1 className="text-2xl font-bold text-center leading-[1.35] tracking-[0.005em]">계정 로그인</h1>
                    <p className="text-sm text-[#53555B] text-center leading-[1.45] tracking-[0.005em]">
                        아이디를 입력해 주세요
                    </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1.5">
                        <Label
                            htmlFor="uid"
                            className="text-xs font-medium text-[#9FA2A7] leading-[1.5em] tracking-[0.005em]"
                        >
                            아이디
                        </Label>
                        <Input
                            id="uid"
                            type="text"
                            {...register('uid', { required: '아이디를 입력해 주세요' })}
                            disabled={isPending}
                            placeholder="아이디 입력"
                            className="h-11 px-3 text-base border-[#EAEAEC] rounded-[10px] bg-[#FEFEFE] leading-[1.45em] tracking-[-0.015em]"
                        />
                        {errors.uid && <p className="text-xs text-destructive px-0.5">{errors.uid.message}</p>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label
                            htmlFor="pwd"
                            className="text-xs font-medium text-[#9FA2A7] leading-[1.5em] tracking-[0.005em]"
                        >
                            비밀번호
                        </Label>
                        <Input
                            id="pwd"
                            type="password"
                            {...register('pwd', { required: '비밀번호를 입력해 주세요' })}
                            disabled={isPending}
                            placeholder="••••••••"
                            className="h-11 px-3 text-base border-[#EAEAEC] rounded-[10px] bg-[#FEFEFE]"
                        />
                        {errors.pwd && <p className="text-xs text-destructive px-0.5">{errors.pwd.message}</p>}
                    </div>
                </form>
            </div>

            <div className="flex flex-col px-4 pb-4">
                <Button
                    onClick={handleSubmit(onSubmit)}
                    disabled={isPending}
                    className="w-full h-[50px] bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325] font-semibold text-base rounded-full disabled:opacity-50"
                >
                    {isPending ? '로그인 중...' : '다음'}
                </Button>
            </div>
        </div>
    );
};
