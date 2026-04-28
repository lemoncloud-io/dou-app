/**
 * Create Deeplink Dialog
 *
 * Dialog for creating a user invite + deeplink.
 * Form-based: channelId and name input.
 */

import { useState } from 'react';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@chatic/ui-kit/components/ui/select';

import { reportError, toError } from '@chatic/web-core';

import { useInviteAndCreateDeeplink } from '../hooks';
import { firebaseService } from '../services';

import type { JSX } from 'react';

interface CreateDeeplinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export const CreateDeeplinkDialog = ({ open, onOpenChange, onSuccess }: CreateDeeplinkDialogProps): JSX.Element => {
    const [channelId, setChannelId] = useState('');
    const [name, setName] = useState('');
    const [alias, setAlias] = useState('');
    const [type, setType] = useState<'phone' | 'email'>('phone');

    const { mutateAsync: inviteAndCreate, isPending } = useInviteAndCreateDeeplink();

    const deeplinkUrlBase = firebaseService.getDeeplinkUrlBase();

    const handleCreate = async () => {
        if (!channelId.trim()) {
            toast.error('Channel ID is required');
            return;
        }
        if (!name.trim()) {
            toast.error('Name is required');
            return;
        }

        try {
            const deeplink = await inviteAndCreate({
                channelId: channelId.trim(),
                name: name.trim(),
                alias: alias.trim() || undefined,
                type,
            });
            toast.success(`Deeplink created: ${deeplink.deepLinkUrl}`);
            resetForm();
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            reportError(toError(error));
            const message = error instanceof Error ? error.message : 'Failed to create deeplink';
            toast.error(message);
        }
    };

    const resetForm = () => {
        setChannelId('');
        setName('');
        setAlias('');
        setType('phone');
    };

    const handleClose = () => {
        resetForm();
        onOpenChange(false);
    };

    const isValid = channelId.trim() && name.trim();

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Create Deeplink</DialogTitle>
                    <DialogDescription>Create a new user invite and generate a deeplink</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {/* Channel ID Input */}
                    <div className="space-y-2">
                        <Label htmlFor="channelId">Channel ID</Label>
                        <Input
                            id="channelId"
                            placeholder="Enter channel ID"
                            value={channelId}
                            onChange={e => setChannelId(e.target.value)}
                            disabled={isPending}
                        />
                        <p className="text-xs text-muted-foreground">The channel ID where the invited user will join</p>
                    </div>

                    {/* Name Input */}
                    <div className="space-y-2">
                        <Label htmlFor="name">User Name</Label>
                        <Input
                            id="name"
                            placeholder="Enter user name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            disabled={isPending}
                        />
                        <p className="text-xs text-muted-foreground">Display name for the invited user</p>
                    </div>

                    {/* Type Select */}
                    <div className="space-y-2">
                        <Label htmlFor="type">Type</Label>
                        <Select value={type} onValueChange={v => setType(v as 'phone' | 'email')} disabled={isPending}>
                            <SelectTrigger id="type">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="phone">Phone</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Invite type (phone or email)</p>
                    </div>

                    {/* Alias Input */}
                    <div className="space-y-2">
                        <Label htmlFor="alias">Alias</Label>
                        <Input
                            id="alias"
                            placeholder={type === 'phone' ? 'Enter phone number' : 'Enter email address'}
                            value={alias}
                            onChange={e => setAlias(e.target.value)}
                            disabled={isPending}
                        />
                        <p className="text-xs text-muted-foreground">
                            {type === 'phone' ? 'Phone number for the invite' : 'Email address for the invite'}
                        </p>
                    </div>

                    {/* Preview */}
                    {isValid && (
                        <div className="p-4 rounded-md bg-muted space-y-2">
                            <div className="text-sm font-medium">Deeplink Preview</div>
                            <div className="text-sm text-muted-foreground break-all font-mono">
                                {deeplinkUrlBase}/{'<inviteCode>'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                The actual invite code will be assigned by the backend
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={!isValid || isPending}>
                        {isPending ? (
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
