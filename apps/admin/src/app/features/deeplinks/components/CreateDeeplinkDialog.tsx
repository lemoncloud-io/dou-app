/**
 * Create Deeplink Dialog
 *
 * Dialog for selecting a user and creating a deeplink.
 * Supports environment-specific deeplink URLs.
 */

import { useState } from 'react';

import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@chatic/ui-kit/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';
import { useUsers } from '@chatic/users';

import { useCreateDeeplink, useDeeplinks } from '../hooks';
import { firebaseService } from '../services';

import type { UserView } from '@lemoncloud/chatic-backend-api';
import type { DeeplinkEnvironment } from '../types';
import type { JSX } from 'react';

interface CreateDeeplinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    env: DeeplinkEnvironment;
}

export const CreateDeeplinkDialog = ({
    open,
    onOpenChange,
    onSuccess,
    env,
}: CreateDeeplinkDialogProps): JSX.Element => {
    const [comboboxOpen, setComboboxOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserView | null>(null);

    const { data: usersData, isLoading: isLoadingUsers } = useUsers({ limit: 100 });
    const { data: deeplinksData } = useDeeplinks(env, { limit: 1000 });
    const { mutateAsync: createDeeplink, isPending: isCreating } = useCreateDeeplink(env);

    // Set of user IDs that already have deeplinks (document ID = user ID)
    const existingUserIds = new Set(deeplinksData?.list.map(d => d.id) ?? []);

    const deeplinkUrlBase = firebaseService.getDeeplinkUrlBase(env);

    const handleSelectUser = async (user: UserView) => {
        setSelectedUser(user);
        setComboboxOpen(false);
    };

    const handleCreate = async () => {
        if (!selectedUser) {
            toast.error('Please select a user');
            return;
        }

        try {
            await createDeeplink(selectedUser);
            toast.success('Deeplink created successfully');
            setSelectedUser(null);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create deeplink';
            toast.error(message);
        }
    };

    const handleClose = () => {
        setSelectedUser(null);
        onOpenChange(false);
    };

    const users: UserView[] = usersData?.list ?? [];

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Create Deeplink ({env})</DialogTitle>
                    <DialogDescription>Select a user to create a deeplink for</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {/* User Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Select User</label>
                        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={comboboxOpen}
                                    className="w-full justify-between"
                                    disabled={isLoadingUsers}
                                >
                                    {isLoadingUsers ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading users...
                                        </span>
                                    ) : selectedUser ? (
                                        <span>
                                            {selectedUser.name} ({selectedUser.loginId || selectedUser.id})
                                        </span>
                                    ) : (
                                        'Select a user...'
                                    )}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[450px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search users..." />
                                    <CommandList>
                                        <CommandEmpty>No users found.</CommandEmpty>
                                        <CommandGroup>
                                            {users.map(user => {
                                                const hasDeeplink = existingUserIds.has(user.id);
                                                return (
                                                    <CommandItem
                                                        key={user.id}
                                                        value={`${user.name} ${user.loginId || ''} ${user.id}`}
                                                        onSelect={() => !hasDeeplink && handleSelectUser(user)}
                                                        disabled={hasDeeplink}
                                                        className={hasDeeplink ? 'opacity-50' : ''}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4',
                                                                selectedUser?.id === user.id
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0'
                                                            )}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{user.name}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {user.loginId || user.id}
                                                                {hasDeeplink && ' (Deeplink exists)'}
                                                            </span>
                                                        </div>
                                                    </CommandItem>
                                                );
                                            })}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Preview */}
                    {selectedUser && (
                        <div className="p-4 rounded-md bg-muted space-y-2">
                            <div className="text-sm font-medium">Deeplink Preview</div>
                            <div className="text-sm text-muted-foreground break-all font-mono">
                                {deeplinkUrlBase}/{selectedUser.id}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={!selectedUser || isCreating}>
                        {isCreating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Deeplink'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
