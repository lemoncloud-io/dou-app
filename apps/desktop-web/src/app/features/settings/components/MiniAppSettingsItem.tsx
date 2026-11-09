import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { FormError, FormField, SettingsNavRow, SettingsRowGroup } from '../../../shared';
import { type MiniAppLinkSave, useMiniAppLauncher, useSubWebViewOpenScope } from '../hooks/useMiniAppLauncher';

/**
 * The settings' "Mini app" section. Drawn only in a shell whose handshake says it opens any https
 * page (`subWebViewOpenScope: 'anyHttps'`): an older shell, the phone and a plain browser never see
 * it. The launcher's own hooks run only past that check.
 */
export const MiniAppSettingsItem = () => {
    const scope = useSubWebViewOpenScope();
    return scope === 'anyHttps' ? <MiniAppSection /> : null;
};

const MiniAppSection = () => {
    const { t } = useTranslation();
    const launcher = useMiniAppLauncher();
    if (!launcher.available) return null;

    const linkHost = launcher.link ? new URL(launcher.link).host : null;

    return (
        <section className="mt-8 flex flex-col gap-4">
            <h2 className="text-overline uppercase text-muted-foreground">{t('settings.miniApp')}</h2>
            <SettingsRowGroup>
                <SettingsNavRow
                    label={t('settings.miniApp.open')}
                    hint={linkHost ?? t('settings.miniApp.openHubHint')}
                    onClick={launcher.open}
                />
                {launcher.isOwner && (
                    <SettingsNavRow
                        label={t('settings.miniApp.link')}
                        hint={launcher.link ?? t('settings.miniApp.linkUnset')}
                        onClick={() => launcher.setLinkSettingsOpen(true)}
                    />
                )}
            </SettingsRowGroup>

            <MiniAppLinkDialog
                open={launcher.isLinkSettingsOpen}
                onOpenChange={launcher.setLinkSettingsOpen}
                link={launcher.link}
                onSave={launcher.saveLink}
            />
            <MiniAppConsentDialog host={launcher.pendingConsentHost} onAnswer={launcher.answerConsent} />
        </section>
    );
};

const MiniAppLinkDialog = ({
    open,
    onOpenChange,
    link,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    link: string | null;
    onSave: (value: string) => MiniAppLinkSave;
}) => {
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Each opening starts from the saved link.
    useEffect(() => {
        if (open) {
            setValue(link ?? '');
            setError(null);
        }
    }, [open, link]);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const outcome = onSave(value);
        if (outcome === 'invalid') {
            setError(t('settings.miniApp.linkInvalid'));
            return;
        }
        if (outcome === 'failed') {
            setError(t('settings.miniApp.linkSaveFailed'));
            return;
        }
        toast({ title: t(value.trim() ? 'settings.miniApp.linkSaved' : 'settings.miniApp.linkRemoved') });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('settings.miniApp.link')}</DialogTitle>
                <DialogDescription>{t('settings.miniApp.linkHint')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <FormField
                        label={t('settings.miniApp.linkLabel')}
                        htmlFor="mini-app-link"
                        errorId="mini-app-link-error"
                        invalid={error != null}
                    >
                        <Input
                            id="mini-app-link"
                            type="url"
                            autoFocus
                            value={value}
                            onChange={e => {
                                setValue(e.target.value);
                                setError(null);
                            }}
                            placeholder="https://"
                        />
                    </FormField>
                    {error && <FormError id="mini-app-link-error">{error}</FormError>}
                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">{t('settings.miniApp.save')}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

/** A yes/no that blocks until answered: closing it any other way is a no. */
const MiniAppConsentDialog = ({ host, onAnswer }: { host: string | null; onAnswer: (agreed: boolean) => void }) => {
    const { t } = useTranslation();
    return (
        <AlertDialog open={host !== null} onOpenChange={next => !next && onAnswer(false)}>
            <AlertDialogContent className="sm:max-w-sm">
                <AlertDialogTitle>{t('settings.miniApp.consentTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                    {t('settings.miniApp.consentBody', { host: host ?? '' })}
                </AlertDialogDescription>
                <AlertDialogFooter className="gap-2 pt-2 sm:space-x-0">
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onAnswer(true)}>
                        {t('settings.miniApp.consentAgree')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
