import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { useDesktopChannelMutations } from '../../../shared';

interface RenameChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: string;
    currentName: string;
}

const MIN = 2;
const MAX = 20;

/**
 * Rename a channel (name 2–20 chars → updateChannel). Matches CreateChannelDialog
 * style. Owner-only gating is enforced by the caller (server also enforces).
 */
export const RenameChannelDialog = ({ open, onOpenChange, channelId, currentName }: RenameChannelDialogProps) => {
    const { t } = useTranslation();
    const { updateChannel, isMutating } = useDesktopChannelMutations();
    const [name, setName] = useState(currentName);
    const [isError, setIsError] = useState(false);

    // Re-seed the input each time the dialog opens for a (possibly different) channel.
    useEffect(() => {
        if (open) {
            setName(currentName);
            setIsError(false);
        }
    }, [open, currentName]);

    const trimmed = name.trim();
    const isValid = trimmed.length >= MIN && trimmed.length <= MAX;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || isMutating) return;
        setIsError(false);
        try {
            await updateChannel({ channelId, name: trimmed });
            onOpenChange(false);
        } catch {
            setIsError(true);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !isMutating && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{t('channels.rename.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('channels.rename.title')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="rename-channel">{t('channels.rename.nameLabel')}</Label>
                        <Input
                            id="rename-channel"
                            autoFocus
                            value={name}
                            maxLength={MAX}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('channels.rename.namePlaceholder')}
                            disabled={isMutating}
                        />
                        <p className="text-xs text-muted-foreground">{t('channels.rename.lengthHint')}</p>
                    </div>

                    {isError && <p className="text-sm text-destructive">{t('channels.rename.failed')}</p>}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isMutating}>
                            {t('channels.rename.cancel')}
                        </Button>
                        <Button type="submit" disabled={isMutating || !isValid}>
                            {isMutating ? t('channels.rename.saving') : t('channels.rename.submit')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
