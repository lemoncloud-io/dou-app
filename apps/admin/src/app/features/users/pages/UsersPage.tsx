import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import copy from 'copy-to-clipboard';

import { formatDate } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';
import { useUsers } from '@chatic/users';

import { RegisterUserDialog } from '../components';

import { reportError, toError } from '@chatic/web-core';

import type { JSX } from 'react';
import { useIssueToken } from '@chatic/auth';
import { useSearchParams } from 'react-router-dom';

export const UsersPage = (): JSX.Element => {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const page = parseInt(searchParams.get('page') || '0', 10);
    const [limit] = useState(10);
    const { data, isLoading, isFetching, isRefetching, error, refetch } = useUsers({ page, limit });
    const [open, setOpen] = useState(false);
    const [tokens, setTokens] = useState<Record<string, string>>({});

    const { mutateAsync: issueToken, issuingLoginId, isPending: isIssuing } = useIssueToken();

    const setPage = (newPage: number) => {
        setSearchParams({ page: newPage.toString() });
    };

    const handleSuccess = () => {
        toast.success('User registered successfully');
        refetch();
    };

    const handleFail = (error: unknown) => {
        console.error('Failed to register user:', error);
        toast.error('Failed to register user');
    };

    const handleGenerateToken = async (loginId: string) => {
        try {
            const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId);

            const {
                Token: { identityToken },
            } = await issueToken({
                uid: loginId,
                pwd: '30126b541b4f5e4704a2daf0fb00b9b6a8cc8999e4f7560591f48b67842975e4',
                email: isEmail,
            });

            setTokens(prev => ({ ...prev, [loginId]: identityToken as string }));
            toast.success(t('users.token.issued'));
        } catch (error) {
            console.error('Failed to issue token:', error);
            reportError(toError(error));
            toast.error(t('users.token.issueFailed'));
        }
    };

    const handleCopyToken = (token: string) => {
        const success = copy(token);
        if (success) {
            toast.success(t('users.token.copied'));
        } else {
            toast.error(t('users.token.copyFailed'));
        }
    };

    const frontEndpoint = import.meta.env.VITE_FRONT_ENDPOINT;

    const handleOpenTokenUrl = (token: string) => {
        const url = `${frontEndpoint}/auth/token/${token}`;
        window.open(url, '_blank');
    };

    if (error) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold">Users</h1>
                    <Button onClick={() => setOpen(true)}>Add User</Button>
                </div>

                <RegisterUserDialog open={open} onOpenChange={setOpen} onSuccess={handleSuccess} onFail={handleFail} />

                <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                    <p className="text-destructive">Failed to load users</p>
                    <Button onClick={() => refetch()}>Retry</Button>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold">Users</h1>
                    <Button onClick={() => setOpen(true)}>Add User</Button>
                </div>

                <RegisterUserDialog open={open} onOpenChange={setOpen} onSuccess={handleSuccess} onFail={handleFail} />

                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Created At</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell>
                                        <Skeleton className="h-4 w-24" />
                                    </TableCell>
                                    <TableCell>
                                        <Skeleton className="h-4 w-32" />
                                    </TableCell>
                                    <TableCell>
                                        <Skeleton className="h-4 w-40" />
                                    </TableCell>
                                    <TableCell>
                                        <Skeleton className="h-4 w-36" />
                                    </TableCell>
                                    <TableCell>
                                        <Skeleton className="h-4 w-24" />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold">Users</h1>
                    <Button onClick={() => setOpen(true)}>Add User</Button>
                </div>

                <RegisterUserDialog open={open} onOpenChange={setOpen} onSuccess={handleSuccess} onFail={handleFail} />

                <div className="flex items-center justify-center min-h-[400px]">
                    <p className="text-muted-foreground">No data available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">Users</h1>
                <div className="flex items-center gap-2">
                    {(isFetching || isRefetching) && (
                        <span className="text-sm text-muted-foreground">Refreshing...</span>
                    )}
                    <Button onClick={() => setOpen(true)}>Add User</Button>
                </div>
            </div>

            <RegisterUserDialog open={open} onOpenChange={setOpen} onSuccess={handleSuccess} onFail={handleFail} />

            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Login ID</TableHead>
                            <TableHead>Created At</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.list.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    No users found
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.list.map(user => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-mono text-sm">{user.id}</TableCell>
                                    <TableCell>{user.name}</TableCell>
                                    <TableCell>{user.loginId}</TableCell>
                                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {!tokens[user.loginId as string] ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleGenerateToken(user.loginId as string)}
                                                    disabled={
                                                        !user.loginId || (isIssuing && issuingLoginId === user.loginId)
                                                    }
                                                >
                                                    {isIssuing && issuingLoginId === user.loginId
                                                        ? t('users.token.issuing')
                                                        : t('users.token.issue')}
                                                </Button>
                                            ) : (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="sm" variant="outline">
                                                            {t('users.token.issuedLabel')}{' '}
                                                            <ChevronDown className="ml-1 h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => handleGenerateToken(user.loginId as string)}
                                                            disabled={isIssuing && issuingLoginId === user.loginId}
                                                        >
                                                            {t('users.token.reissue')}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                handleCopyToken(tokens[user.loginId as string])
                                                            }
                                                        >
                                                            <Copy className="mr-2 h-4 w-4" />
                                                            {t('users.token.copy')}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                handleOpenTokenUrl(tokens[user.loginId as string])
                                                            }
                                                        >
                                                            <ExternalLink className="mr-2 h-4 w-4" />
                                                            {t('users.token.openInNewTab')}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {data.total && data.total > limit && (
                <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                        Showing {page * limit + 1} to {Math.min((page + 1) * limit, data.total)} of {data.total} users
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                        >
                            Previous
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPage(page + 1)}
                            disabled={(page + 1) * limit >= data.total}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
