import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { formatDate } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';

import { RegisterUserDialog } from '../components/RegisterUserDialog';
import { useUsers } from '../api/usersQuery';

import type { JSX } from 'react';

/**
 * Relay user list + registration, carried over from the retired `apps/admin` (ADR-0070 5단계).
 *
 * **The token-issuance column did not come with it.** In admin that action logged in AS the listed
 * user with a password hash hardcoded in the source, and handed back their identityToken to copy.
 * The hook behind it (`useIssueToken`) had no definition anywhere in the repo, so the column could
 * not have worked in its final state either. Reviving it would mean planting that shared credential
 * into a new app — a deliberate decision, not a side effect of a package move. If the capability is
 * needed, build it against `generateToken` (`POST /auth/0/generate-token`), which is a real endpoint
 * with real inputs rather than an impersonation shortcut.
 */
const PAGE_SIZE = 10;

export const UsersPage = (): JSX.Element => {
    const [searchParams, setSearchParams] = useSearchParams();
    const page = parseInt(searchParams.get('page') || '0', 10);
    const { data, isLoading, isFetching, isRefetching, error, refetch } = useUsers({ page, limit: PAGE_SIZE });
    const [open, setOpen] = useState(false);

    const setPage = (next: number) => setSearchParams({ page: String(next) });

    const header = (
        <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Users</h1>
            <div className="flex items-center gap-2">
                {(isFetching || isRefetching) && <span className="text-muted-foreground text-sm">Refreshing…</span>}
                <Button onClick={() => setOpen(true)}>Add User</Button>
            </div>
        </div>
    );

    const dialog = (
        <RegisterUserDialog
            open={open}
            onOpenChange={setOpen}
            onSuccess={() => {
                void refetch();
            }}
            onFail={() => undefined}
        />
    );

    if (error) {
        return (
            <div className="p-6">
                {header}
                {dialog}
                <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
                    <p className="text-destructive">Failed to load users</p>
                    <Button onClick={() => void refetch()}>Retry</Button>
                </div>
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div className="p-6">
                {header}
                {dialog}
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Login ID</TableHead>
                                <TableHead>Created At</TableHead>
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
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    }

    const total = data.meta.total;

    return (
        <div className="p-6">
            {header}
            {dialog}

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Login ID</TableHead>
                            <TableHead>Created At</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.list.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                                    No users
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.list.map(user => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-mono text-xs">{user.id}</TableCell>
                                    <TableCell>{user.name ?? '-'}</TableCell>
                                    <TableCell>{user.loginId ?? '-'}</TableCell>
                                    <TableCell>{user.createdAt ? formatDate(user.createdAt) : '-'}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between">
                    <div className="text-muted-foreground text-sm">
                        Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, total)} of {total} users
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
                            disabled={(page + 1) * PAGE_SIZE >= total}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
