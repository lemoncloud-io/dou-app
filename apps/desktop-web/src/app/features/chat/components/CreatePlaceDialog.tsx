import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
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

import { useCreatePlace } from '../../../shared';
import { useCreatePlaceDialogStore } from '../stores';
import { createPlaceFailure, PLACE_NAME_MAX, type CreatePlaceFailure } from '../utils';

/** `enter`: the place exists, and the switch into it is what failed. */
type Failure = CreatePlaceFailure | 'enter';

// Only the failures a second try can fix say "try again"; a refusal says what it is.
const FAILURE_KEY: Record<Failure, string> = {
    denied: 'place.create.failed.denied',
    network: 'errors.network',
    other: 'place.create.failed',
    enter: 'place.create.enterFailed',
};

interface CreatePlaceDialogProps {
    /**
     * Move the session into the new place, rejecting when the switch fails. The host passes its own
     * switch so the rail it renders locks while this one runs.
     */
    onEnter: (placeId: string) => Promise<void>;
}

/**
 * Make a place in the active cloud and go into it. Two steps that can fail apart: once the place
 * is made, a failed switch keeps the dialog open and the next submit only switches, so a retry
 * never makes a second place.
 */
export const CreatePlaceDialog = ({ onEnter }: CreatePlaceDialogProps) => {
    const { t } = useTranslation();
    const isOpen = useCreatePlaceDialogStore(s => s.isOpen);
    const setOpen = useCreatePlaceDialogStore(s => s.setOpen);
    const { createPlace } = useCreatePlace();

    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<Failure | null>(null);
    // A place this dialog made but has not entered yet: what the next submit retries.
    const [unenteredPlaceId, setUnenteredPlaceId] = useState<string | null>(null);

    const trimmed = name.trim();

    // Counts the times the dialog has closed. A submit remembers the count it started under and
    // stops when it reads another, so a request that answers after the close does nothing more.
    const session = useRef(0);

    // Start clean on every close, whoever closed it. The host closes the dialog when the cloud
    // changes under it, and a place left unentered there must not be retried from another cloud.
    useEffect(() => {
        if (isOpen) return;
        session.current += 1;
        setName('');
        setSubmitting(false);
        setFailure(null);
        setUnenteredPlaceId(null);
    }, [isOpen]);

    const handleOpenChange = (next: boolean) => {
        // Escape, the X and the backdrop are ignored while the place is being made, as in the
        // channel dialog: closing then would drop a failure message with nobody to read it.
        if (next || submitting) return;
        setOpen(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || !trimmed) return;
        setSubmitting(true);
        setFailure(null);
        const startedIn = session.current;
        // The store is read as well: the count only moves once the close has rendered.
        const closed = () => session.current !== startedIn || !useCreatePlaceDialogStore.getState().isOpen;

        let placeId = unenteredPlaceId;
        if (!placeId) {
            try {
                placeId = (await createPlace({ name: trimmed })).id;
                // Made, but for the cloud the dialog was open in: the place stays on that
                // cloud's rail, and the session is not moved into it from wherever it is now.
                if (closed()) return;
                setUnenteredPlaceId(placeId);
            } catch (error) {
                // Classified before the check: that is where the failure is logged.
                const reason = createPlaceFailure(error);
                if (closed()) return;
                setFailure(reason);
                setSubmitting(false);
                return;
            }
        }

        try {
            await onEnter(placeId);
        } catch (error) {
            logger.error('PLACE', '[CreatePlace] enter failed', { error, placeId });
            if (closed()) return;
            setFailure('enter');
            setSubmitting(false);
            return;
        }

        if (closed()) return;
        setOpen(false);
        toast({ description: t('place.create.created') });
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('place.create.title')}</DialogTitle>
                <DialogDescription>{t('place.create.description')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="place-name">{t('place.create.nameLabel')}</Label>
                        <Input
                            id="place-name"
                            autoFocus
                            value={name}
                            maxLength={PLACE_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('place.create.namePlaceholder')}
                            // The place already carries its name once it is made; only the switch is left.
                            disabled={submitting || unenteredPlaceId !== null}
                            aria-describedby="place-name-hint"
                        />
                        <p id="place-name-hint" className="text-micro text-muted-foreground">
                            {t('place.create.nameHint', { max: PLACE_NAME_MAX })}
                        </p>
                    </div>

                    {failure && (
                        <p role="alert" className="text-callout text-destructive">
                            {t(FAILURE_KEY[failure])}
                        </p>
                    )}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={submitting}
                        >
                            {t('place.create.cancel')}
                        </Button>
                        <Button type="submit" disabled={submitting || !trimmed}>
                            {submitting ? t('place.create.creating') : t('place.create.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
