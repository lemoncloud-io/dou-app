import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { relayOverrideFor, relayTargetFor, type ServiceStage } from '../../../config/stageEndpoints';

import type { RegisterUserV2Body } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

type UserFormData = {
    name: string;
    loginId: string;
    loginPw: string;
    email: string;
    siteId: string;
    siteNm: string;
    cloudId: string;
};

interface RegisterUserDialogProps {
    stage: ServiceStage;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    onFail?: (error: unknown) => void;
}

export const RegisterUserDialog = ({
    stage,
    open,
    onOpenChange,
    onSuccess,
    onFail,
}: RegisterUserDialogProps): JSX.Element => {
    const { mutateAsync: registerUser, isPending } = runtime.session.useRegisterUserV2();
    const [failure, setFailure] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<UserFormData>({
        defaultValues: {
            name: '',
            loginId: '',
            loginPw: '',
            email: '',
            siteId: '',
            siteNm: '',
            cloudId: '',
        },
    });

    const onSubmit = async (data: UserFormData) => {
        setFailure(null);
        try {
            const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.loginId);

            const body: RegisterUserV2Body = {
                stereo: 'user',
                ...data,
            };
            await registerUser({ ...body, email: isEmail, endpoint: relayOverrideFor(stage) } as RegisterUserV2Body & {
                email: boolean;
                endpoint?: string;
            });
            onOpenChange(false);
            reset();
            onSuccess?.();
        } catch (error) {
            logger.error('GLOBAL', '[RegisterUserDialog] register failed', { error });
            setFailure(error instanceof Error ? error.message : 'Registration failed.');
            onFail?.(error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent closeLabel="Close">
                <DialogHeader>
                    <DialogTitle>Register New User</DialogTitle>
                    <DialogDescription>
                        Create a new user account on {stage === 'v1' ? 'Production' : 'Development'} —{' '}
                        <span className="font-mono">{relayTargetFor(stage) || '(not configured)'}</span>
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="space-y-4 py-4 ">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" {...register('name', { required: 'Name is required' })} />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="loginId">Login ID</Label>
                            <Input id="loginId" {...register('loginId', { required: 'Login ID is required' })} />
                            {errors.loginId && <p className="text-sm text-destructive">{errors.loginId.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="loginPw">Password</Label>
                            <Input
                                id="loginPw"
                                type="password"
                                {...register('loginPw', { required: 'Password is required' })}
                            />
                            {errors.loginPw && <p className="text-sm text-destructive">{errors.loginPw.message}</p>}
                        </div>
                    </div>
                    {failure && (
                        <p role="alert" className="pb-2 text-sm text-destructive">
                            {failure}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? 'Creating...' : 'Create User'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
