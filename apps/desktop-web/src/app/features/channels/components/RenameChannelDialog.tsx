import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@chatic/ui-kit/components/ui/dialog';

import { useDesktopChannelMutations } from '../../../shared';
import { CHANNEL_NAME_MAX, CHANNEL_NAME_MIN, channelActionErrorKey } from '../utils';
import { ChannelNameField } from './ChannelNameField';

interface RenameChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: string;
    currentName: string;
}

const MIN = CHANNEL_NAME_MIN;
const MAX = CHANNEL_NAME_MAX;

/**
 * Rename a channel (name 2–20 chars → updateChannel). Matches CreateChannelDialog
 * style. Owner-only gating is enforced by the caller (server also enforces).
 */
export const RenameChannelDialog = ({ open, onOpenChange, channelId, currentName }: RenameChannelDialogProps) => {
    const { t } = useTranslation();
    const { updateChannel, isMutating } = useDesktopChannelMutations();
    const [name, setName] = useState(currentName);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showInvalid, setShowInvalid] = useState(false);

    // Re-seed the input each time the dialog opens for a (possibly different) channel.
    useEffect(() => {
        if (open) {
            setName(currentName);
            setErrorMsg(null);
            setShowInvalid(false);
        }
    }, [open, currentName]);

    const trimmed = name.trim();
    const isValid = trimmed.length >= MIN && trimmed.length <= MAX;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isMutating) return;
        if (!isValid) {
            setShowInvalid(true);
            return;
        }
        setErrorMsg(null);
        try {
            await updateChannel({ channelId, name: trimmed });
            onOpenChange(false);
        } catch (e) {
            // A sentence the person can act on; the wire text (e.g. "403 NOT ALLOWED -
            // action[update] is invalid …") goes to the console only.
            setErrorMsg(t(channelActionErrorKey(e)));
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !isMutating && onOpenChange(next)}>
            {/* No description: the title and the field's own label and hint say it all, and a
                hidden copy of the title made a screen reader read it twice. `undefined` is
                Radix's opt-out from its missing-description warning. */}
            <DialogContent closeLabel={t('common.close')} aria-describedby={undefined} className="sm:max-w-md">
                <DialogTitle>{t('channels.rename.title')}</DialogTitle>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <ChannelNameField
                        id="rename-channel"
                        label={t('channels.rename.nameLabel')}
                        placeholder={t('channels.rename.namePlaceholder')}
                        value={name}
                        onChange={value => {
                            setName(value);
                            setShowInvalid(false);
                        }}
                        disabled={isMutating}
                        showInvalid={showInvalid}
                    />

                    {errorMsg && (
                        <p className="text-callout text-destructive break-words" role="alert">
                            {errorMsg}
                        </p>
                    )}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isMutating}
                        >
                            {t('channels.rename.cancel')}
                        </Button>
                        <Button type="submit" disabled={isMutating || trimmed.length === 0}>
                            {isMutating ? t('channels.rename.saving') : t('channels.rename.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
