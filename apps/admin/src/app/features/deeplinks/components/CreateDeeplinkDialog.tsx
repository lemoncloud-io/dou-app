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

import { useInviteAndCreateDeeplink } from '../hooks';
import { firebaseService } from '../services';

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
    const [channelId, setChannelId] = useState('');
    const [name, setName] = useState('');

    const { mutateAsync: inviteAndCreate, isPending } = useInviteAndCreateDeeplink(env);

    const deeplinkUrlBase = firebaseService.getDeeplinkUrlBase(env);

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
            });
            toast.success(`Deeplink created: ${deeplink.deepLinkUrl}`);
            resetForm();
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create deeplink';
            toast.error(message);
        }
    };

    const resetForm = () => {
        setChannelId('');
        setName('');
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
                    <DialogTitle>Create Deeplink ({env})</DialogTitle>
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

                    {/* Preview */}
                    {isValid && (
                        <div className="p-4 rounded-md bg-muted space-y-2">
                            <div className="text-sm font-medium">Deeplink Preview</div>
                            <div className="text-sm text-muted-foreground break-all font-mono">
                                {deeplinkUrlBase}/{'<userId>'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                The actual userId will be assigned by the backend
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
