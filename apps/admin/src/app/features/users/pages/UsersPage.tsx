import { useState } from 'react';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { formatDate } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';
import { useUsers } from '@chatic/users';

import { RegisterUserDialog } from '../components';

import type { JSX } from 'react';
import { useIssueToken } from '@chatic/auth';

export const UsersPage = (): JSX.Element => {
    const [page, setPage] = useState(0);
    const [limit] = useState(10);
    const { data, isLoading, isFetching, isRefetching, error, refetch } = useUsers({ page, limit });
    const [open, setOpen] = useState(false);
    const [tokens, setTokens] = useState<Record<string, string>>({});

    const { mutateAsync: issueToken, issuingLoginId, isPending: isIssuing } = useIssueToken();

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
            toast.success('토큰이 발급되었습니다');
        } catch (error) {
            console.error('Failed to issue token:', error);
            toast.error('토큰 발급에 실패했습니다');
        }
    };

    const handleCopyToken = async (token: string) => {
        try {
            await navigator.clipboard.writeText(token);
            toast.success('토큰이 복사되었습니다');
        } catch (error) {
            toast.error('복사에 실패했습니다');
        }
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
                            <TableHead>Email</TableHead>
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
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleGenerateToken(user.loginId as string)}
                                                disabled={
                                                    !user.loginId || (isIssuing && issuingLoginId === user.loginId)
                                                }
                                            >
                                                {isIssuing && issuingLoginId === user.loginId
                                                    ? '발급 중...'
                                                    : '토큰 발급'}
                                            </Button>
                                            {tokens[user.loginId as string] && (
                                                <>
                                                    <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                                                        {tokens[user.loginId as string]}
                                                    </span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleCopyToken(tokens[user.loginId as string])}
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                </>
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
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            Previous
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPage(p => p + 1)}
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
