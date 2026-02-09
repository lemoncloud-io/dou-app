import { useState } from 'react';

import { toast } from 'sonner';

import { formatDate } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';
import { useUsers } from '@chatic/users';

import { RegisterUserDialog } from '../components';

import type { JSX } from 'react';

export const UsersPage = (): JSX.Element => {
    const { data, isLoading, isFetching, isRefetching, error, refetch } = useUsers();
    const [open, setOpen] = useState(false);

    const handleSuccess = () => {
        toast.success('User registered successfully');
        refetch();
    };

    const handleFail = (error: unknown) => {
        console.error('Failed to register user:', error);
        toast.error('Failed to register user');
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
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.list.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">
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
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
