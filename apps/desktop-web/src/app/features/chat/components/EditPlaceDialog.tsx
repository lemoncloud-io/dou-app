import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImagePlus } from 'lucide-react';

import { logger } from '@chatic/bridges';
import type { DomainPlace } from '@chatic/data';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useUpdatePlace } from '../../../shared';
import { useEditPlaceDialogStore } from '../stores';
import { PLACE_IMAGE_MAX_BYTES, PLACE_NAME_MAX, placeFailure, type PlaceFailure } from '../utils';

/** The two `image` ones are about the photo just picked, before anything was sent. */
type Failure = PlaceFailure | 'imageTooLarge' | 'imageFailed';

// Only the failures a second try can fix say "try again"; a refusal says what it is.
const FAILURE_KEY: Record<Failure, string> = {
    denied: 'place.edit.failed.denied',
    network: 'errors.network',
    other: 'place.edit.failed',
    imageTooLarge: 'place.create.imageTooLarge',
    imageFailed: 'place.create.imageFailed',
};

const IMAGE_MAX_MB = PLACE_IMAGE_MAX_BYTES / (1024 * 1024);

interface EditPlaceDialogProps {
    /** The places on the rail. The dialog edits the one the store names, and closes if it leaves. */
    places: readonly DomainPlace[];
}

/**
 * Change the name or photo of a place that already exists. Only what was changed is sent, and the
 * save stays off until something was. The form is separate from the one that makes a place: that
 * one carries a second step, entering the place, and this one ends when the save lands.
 */
export const EditPlaceDialog = ({ places }: EditPlaceDialogProps) => {
    const { t } = useTranslation();
    const placeId = useEditPlaceDialogStore(s => s.placeId);
    const close = useEditPlaceDialogStore(s => s.close);
    const { updatePlace } = useUpdatePlace();
    const place = placeId ? places.find(p => p.id === placeId) : undefined;
    const isOpen = !!place;

    const [name, setName] = useState('');
    // The photo as the form shows it: the place's own URL until one is picked, `undefined` once removed.
    const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);
    const fileRef = useRef<HTMLInputElement>(null);
    // A photo is being read. The save waits for it, or it would go out without the photo shown next.
    const [encoding, setEncoding] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<Failure | null>(null);

    // Counts the times the dialog has opened or closed. A request remembers the count it started
    // under and stops when it reads another, so an answer for a form that is gone does nothing.
    const session = useRef(0);

    // The store names a place the rail no longer has: it was deleted, or the cloud changed under
    // the dialog. Clear the name so a place with that id cannot reopen the form later.
    useEffect(() => {
        if (placeId && !place) close();
    }, [placeId, place, close]);

    // Start from the place as it is, each time the dialog opens on one. Keyed on the id alone: the
    // row itself changes while a save is in flight, and that must not wipe what is being typed.
    useEffect(() => {
        session.current += 1;
        setName(place?.name ?? '');
        setThumbnail(place?.thumbnail || undefined);
        setEncoding(false);
        setSubmitting(false);
        setFailure(null);
    }, [place?.id]);

    const trimmed = name.trim();
    const nameChanged = !!place && trimmed !== (place.name ?? '');
    const photoChanged = !!place && thumbnail !== (place.thumbnail || undefined);
    const canSave = !!trimmed && (nameChanged || photoChanged) && !submitting && !encoding;

    const handleOpenChange = (next: boolean) => {
        // Escape, the X and the backdrop are ignored while the save runs, as in the create dialog:
        // closing then would drop a failure message with nobody to read it.
        if (next || submitting) return;
        close();
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Cleared so that picking the same file again, after a failure or a remove, still fires.
        e.target.value = '';
        if (!file) return;
        setFailure(null);
        if (file.size > PLACE_IMAGE_MAX_BYTES) {
            setFailure('imageTooLarge');
            return;
        }
        const startedIn = session.current;
        setEncoding(true);
        try {
            const { avatar } = await prepareImage(file, AVATAR_IMAGE);
            if (!avatar) throw new Error('Failed to prepare place image');
            if (session.current === startedIn) setThumbnail(avatar);
        } catch (error) {
            logger.warn('PLACE', '[EditPlace] image failed', { error });
            // The photo shown before is kept: this one simply was not taken.
            if (session.current === startedIn) setFailure('imageFailed');
        } finally {
            if (session.current === startedIn) setEncoding(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!place || !canSave) return;
        setSubmitting(true);
        setFailure(null);
        const startedIn = session.current;
        try {
            await updatePlace({
                id: place.id,
                ...(nameChanged && { name: trimmed }),
                // An empty string for a removed photo, the value the web app sends for the same edit.
                ...(photoChanged && { thumbnail: thumbnail ?? '' }),
            });
        } catch (error) {
            // Classified before the check: that is where the failure is logged.
            const reason = placeFailure(error, 'EditPlace');
            if (session.current !== startedIn) return;
            setFailure(reason);
            setSubmitting(false);
            return;
        }
        if (session.current !== startedIn) return;
        close();
        toast({ description: t('place.edit.saved') });
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('place.edit.title')}</DialogTitle>
                <DialogDescription>{t('place.edit.description')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 rounded-xl">
                            {thumbnail && <AvatarImage src={thumbnail} alt={trimmed} />}
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
                                {t(thumbnail ? 'place.create.changePhoto' : 'place.create.photo')}
                            </Button>
                            {thumbnail && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={submitting || encoding}
                                    onClick={() => setThumbnail(undefined)}
                                >
                                    {t('place.create.removePhoto')}
                                </Button>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => void handleFile(e)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-place-name">{t('place.create.nameLabel')}</Label>
                        <Input
                            id="edit-place-name"
                            autoFocus
                            value={name}
                            maxLength={PLACE_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('place.create.namePlaceholder')}
                            disabled={submitting}
                            aria-describedby="edit-place-name-hint"
                        />
                        <p id="edit-place-name-hint" className="text-micro text-muted-foreground">
                            {t('place.create.nameHint', { max: PLACE_NAME_MAX })}
                        </p>
                    </div>

                    {failure && (
                        <p role="alert" className="text-callout text-destructive">
                            {t(FAILURE_KEY[failure], { max: IMAGE_MAX_MB })}
                        </p>
                    )}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={submitting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={!canSave}>
                            {submitting ? t('place.edit.saving') : t('place.edit.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
