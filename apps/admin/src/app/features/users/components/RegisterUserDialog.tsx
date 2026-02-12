import { useForm } from 'react-hook-form';

import { Dices } from 'lucide-react';

import { useRegisterUserV2 } from '@chatic/auth';
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
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    onFail?: (error: unknown) => void;
}

export const RegisterUserDialog = ({ open, onOpenChange, onSuccess, onFail }: RegisterUserDialogProps): JSX.Element => {
    const { mutateAsync: registerUser, isPending } = useRegisterUserV2();

    const {
        register,
        handleSubmit,
        reset,
        setValue,
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

    const generateRandomId = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };

    const onSubmit = async (data: UserFormData) => {
        try {
            const body: RegisterUserV2Body = {
                stereo: 'user',
                ...data,
            };
            await registerUser(body);
            onOpenChange(false);
            reset();
            onSuccess?.();
        } catch (error) {
            onFail?.(error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Register New User</DialogTitle>
                    <DialogDescription>Create a new user account</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="cloudId">Cloud ID</Label>
                            <div className="flex gap-2">
                                <Input id="cloudId" {...register('cloudId', { required: 'Cloud ID is required' })} />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setValue('cloudId', generateRandomId())}
                                >
                                    <Dices className="h-4 w-4" />
                                </Button>
                            </div>
                            {errors.cloudId && <p className="text-sm text-destructive">{errors.cloudId.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="siteId">Site ID</Label>
                            <div className="flex gap-2">
                                <Input id="siteId" {...register('siteId', { required: 'Site ID is required' })} />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setValue('siteId', generateRandomId())}
                                >
                                    <Dices className="h-4 w-4" />
                                </Button>
                            </div>
                            {errors.siteId && <p className="text-sm text-destructive">{errors.siteId.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="siteNm">Site Name</Label>
                            <Input id="siteNm" {...register('siteNm', { required: 'Site Name is required' })} />
                            {errors.siteNm && <p className="text-sm text-destructive">{errors.siteNm.message}</p>}
                        </div>
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
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                {...register('email', {
                                    required: 'Email is required',
                                    pattern: {
                                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                        message: 'Invalid email address',
                                    },
                                })}
                            />
                            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                        </div>
                    </div>
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
