import { useEffect, useState } from 'react';

import { Search } from 'lucide-react';

import { deleteUndefinedProperty, useDebounce } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { useUsers } from '@chatic/users';

import type { JSX } from 'react';

interface UserSelectDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (userId: string) => void;
}

export const UserSelectDialog = ({ isOpen, onClose, onSelect }: UserSelectDialogProps): JSX.Element => {
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 500);
    const limit = 10;

    useEffect(() => {
        setPage(0);
    }, [debouncedSearch]);

    const {
        data: usersData,
        isLoading,
        error,
        refetch,
    } = useUsers(deleteUndefinedProperty({ limit, page, name: debouncedSearch }));

    const totalPages = usersData?.total ? Math.ceil(usersData.total / limit) : 0;

    if (error) {
        return (
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Select User</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <p className="text-sm text-destructive">Failed to load users</p>
                        <Button size="sm" onClick={() => refetch()} className="h-7 text-xs">
                            Retry
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Select User</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-8 h-8 text-xs"
                        />
                    </div>

                    <div className="max-h-96 overflow-y-auto border rounded">
                        {isLoading ? (
                            <div className="text-center py-8 text-sm text-muted-foreground">Loading users...</div>
                        ) : usersData?.list.length ? (
                            <div>
                                {usersData.list.map(user => (
                                    <button
                                        key={user.id}
                                        onClick={() => {
                                            onSelect(user.id);
                                            onClose();
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b last:border-b-0"
                                    >
                                        <div className="font-medium">{user.name}</div>
                                        <div className="text-muted-foreground">{user.email}</div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-sm text-muted-foreground">No users found</div>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0 || isLoading}
                                className="h-7 text-xs"
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                Page {page + 1} of {totalPages}
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1 || isLoading}
                                className="h-7 text-xs"
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
