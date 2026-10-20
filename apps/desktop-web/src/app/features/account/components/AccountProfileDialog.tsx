import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus } from 'lucide-react';

import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { logger } from '@chatic/bridges';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useRelayAccount, type RelayAccount, FormError, FormField, toastFailure } from '../../../shared';

/** The longest account name the form accepts, matching the web edit page. */
export const ACCOUNT_NAME_MAX = 30;
/** The largest photo the form takes, checked before the file is read at all. */
const ACCOUNT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

interface AccountProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initial: RelayAccount;
}

/**
 * Relay account name + photo edit. Saves through the relay-pinned gateway
 * (the token patch is the update path); a refused save stays open with its
 * error instead of stranding it on a closed dialog.
 */
export const AccountProfileDialog = ({ open, onOpenChange, initial }: AccountProfileDialogProps) => {
    const { t } = useTranslation();
    const { updateAccount } = useRelayAccount();
    const [name, setName] = useState(initial.name ?? '');
    const [photo, setPhoto] = useState<string | undefined>(initial.photo);
    const [encoding, setEncoding] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Seed on the opening edge only: the relay user object is rebuilt on every
    // session notify, and reseeding off it wipes a half-typed name and photo.
    const wasOpen = useRef(false);
    useEffect(() => {
        if (open && !wasOpen.current) {
            setName(initial.name ?? '');
            setPhoto(initial.photo);
            setFailure(null);
            setSubmitting(false);
            setEncoding(false);
        }
        wasOpen.current = open;
    }, [open, initial]);

    const trimmed = name.trim();
    const nameChanged = trimmed !== (initial.name ?? '').trim();
    const photoChanged = photo !== initial.photo;
    const canSave = !!trimmed && (nameChanged || photoChanged) && !submitting && !encoding;

    const handleOpenChange = (next: boolean) => {
        // Escape, the X and the backdrop are ignored while the save runs: a
        // closed dialog has nowhere to show the failure.
        if (next || submitting) return;
        onOpenChange(next);
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setFailure(null);
        if (file.size > ACCOUNT_PHOTO_MAX_BYTES) {
            setFailure(t('account.profile.photoTooLarge'));
            return;
        }
        setEncoding(true);
        try {
            const { avatar } = await prepareImage(file, AVATAR_IMAGE);
            if (!avatar) throw new Error('Failed to prepare account image');
            setPhoto(avatar);
        } catch (error) {
            logger.warn('ACCOUNT', '[AccountProfile] image failed', { error });
            setFailure(t('account.profile.photoFailed'));
        } finally {
            setEncoding(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setSubmitting(true);
        setFailure(null);
        try {
            await updateAccount({ name: trimmed, ...(photoChanged ? { photo } : {}) });
            toast({ title: t('account.profile.saved') });
            onOpenChange(false);
        } catch (error) {
            setFailure(t('account.profile.saveFailed'));
            toastFailure(t('account.profile.saveFailed'), error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('account.profile.title')}</DialogTitle>
                <DialogDescription>{t('account.profile.subtitle')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 rounded-xl">
                            {photo && <AvatarImage src={photo} alt={trimmed} />}
                            <AvatarFallback className="rounded-xl bg-muted text-muted-foreground">
                                <ImagePlus className="h-5 w-5" aria-hidden />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={submitting || encoding}
                                onClick={() => fileRef.current?.click()}
                            >
                                {t(photo ? 'account.profile.changePhoto' : 'account.profile.addPhoto')}
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => void handleFile(e)}
                            />
                        </div>
                    </div>

                    <FormField
                        label={t('account.profile.nameLabel')}
                        htmlFor="account-profile-name"
                        errorId="account-profile-name-error"
                        invalid={failure != null}
                    >
                        <Input
                            id="account-profile-name"
                            autoFocus
                            value={name}
                            maxLength={ACCOUNT_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            disabled={submitting}
                        />
                    </FormField>

                    {failure && <FormError id="account-profile-name-error">{failure}</FormError>}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={!canSave}>
                            {submitting ? t('account.profile.saving') : t('account.profile.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
