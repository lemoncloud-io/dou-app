import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { classifyWireError, extractErrorMessage, useRenameCloud, type WireErrorKind } from '../../../shared';

const CLOUD_NAME_MIN = 2;
const CLOUD_NAME_MAX = 30;

// Anything not listed reads as the generic line. `notFound` and `conflict` have cloud wording of
// their own: the shared ones talk about channels.
const ERROR_KEY_BY_KIND: Partial<Record<WireErrorKind, string>> = {
    denied: 'errors.notAllowed',
    notFound: 'cloud.rename.error.notFound',
    conflict: 'cloud.rename.error.conflict',
    network: 'errors.network',
};

/** The wire text goes to the log; the person gets a sentence they can act on. */
const renameErrorKey = (error: unknown): string => {
    const raw = extractErrorMessage(error);
    logger.error('CLOUD', '[CloudRename] failed', { error, raw });
    return ERROR_KEY_BY_KIND[classifyWireError(raw)] ?? 'errors.generic';
};

interface RenameCloudDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cloudId: string;
    currentName: string;
}

/**
 * Rename an owned cloud with a one-line field. Follows RenameChannelDialog; owner-only exposure is
 * the caller's call (the server enforces it too).
 */
export const RenameCloudDialog = ({ open, onOpenChange, cloudId, currentName }: RenameCloudDialogProps) => {
    const { t } = useTranslation();
    const { renameCloud, isRenaming } = useRenameCloud();
    const [name, setName] = useState(currentName);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Re-seed the input each time the dialog opens for a (possibly different) cloud.
    useEffect(() => {
        if (open) {
            setName(currentName);
            setErrorMsg(null);
        }
    }, [open, currentName]);

    const trimmed = name.trim();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isRenaming || trimmed.length < CLOUD_NAME_MIN) return;
        // Nothing changed — close without a round trip.
        if (trimmed === currentName) {
            onOpenChange(false);
            return;
        }
        setErrorMsg(null);
        try {
            await renameCloud(cloudId, trimmed);
            onOpenChange(false);
        } catch (error) {
            setErrorMsg(t(renameErrorKey(error)));
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !isRenaming && onOpenChange(next)}>
            <DialogContent closeLabel={t('common.close')} aria-describedby={undefined} className="sm:max-w-md">
                <DialogTitle>{t('cloud.rename.title')}</DialogTitle>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="rename-cloud">{t('cloud.rename.nameLabel')}</Label>
                        <Input
                            id="rename-cloud"
                            autoFocus
                            value={name}
                            maxLength={CLOUD_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('cloud.rename.namePlaceholder')}
                            disabled={isRenaming}
                            aria-describedby="rename-cloud-hint"
                        />
                        <p id="rename-cloud-hint" className="text-micro text-muted-foreground">
                            {t('cloud.rename.lengthHint')}
                        </p>
                    </div>

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
                            disabled={isRenaming}
                        >
                            {t('cloud.rename.cancel')}
                        </Button>
                        <Button type="submit" disabled={isRenaming || trimmed.length < CLOUD_NAME_MIN}>
                            {isRenaming ? t('cloud.rename.saving') : t('cloud.rename.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
