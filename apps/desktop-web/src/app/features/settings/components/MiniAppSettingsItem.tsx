import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { MiniAppLink } from '@chatic/shared';

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
import { MINI_APP_LINK_LIMIT, MINI_APP_LINK_NAME_MAX } from '@chatic/shared';

import { FormError, FormField, SettingsNavRow, SettingsRowGroup } from '../../../shared';
import {
    type MiniAppLinkEditing,
    type MiniAppLinkSave,
    useMiniAppLauncher,
    useSubWebViewOpenScope,
} from '../hooks/useMiniAppLauncher';

/**
 * The settings' "Mini app" section. Drawn only in a shell whose handshake says it opens any https
 * page (`subWebViewOpenScope: 'anyHttps'`): an older shell, the phone and a plain browser never see
 * it. The launcher's own hooks run only past that check.
 */
export const MiniAppSettingsItem = () => {
    const scope = useSubWebViewOpenScope();
    return scope === 'anyHttps' && isPreProductionBuild() ? <MiniAppSection /> : null;
};

/**
 * Mini apps are not released to production yet, so the section shows on LOCAL and DEV builds only.
 * The raw build value is read, not the config registry: a build that lost its stage must hide the
 * section like production does, not show it like a developer's machine.
 */
const isPreProductionBuild = (): boolean => {
    const stage = String(import.meta.env.VITE_ENV ?? '').toUpperCase();
    return stage === 'LOCAL' || stage === 'DEV';
};

const MiniAppSection = () => {
    const { t } = useTranslation();
    const launcher = useMiniAppLauncher();
    if (!launcher.available) return null;
    const count = launcher.links.length;

    return (
        <section className="mt-8 flex flex-col gap-4">
            <h2 className="text-overline uppercase text-muted-foreground">{t('settings.miniApp')}</h2>
            <SettingsRowGroup>
                {/* The hub is the way in for everyone: it lists this cloud's mini apps and opens the one chosen. */}
                <SettingsNavRow
                    label={t('settings.miniApp.open')}
                    hint={count > 0 ? t('settings.miniApp.openHint', { count }) : t('settings.miniApp.openHubHint')}
                    onClick={launcher.openHub}
                />
                {launcher.isOwner &&
                    launcher.links.map(link => (
                        <SettingsNavRow
                            key={link.id}
                            label={link.name}
                            hint={t('settings.miniApp.manageHint', { host: new URL(link.url).host })}
                            onClick={() => launcher.setEditing(link)}
                        />
                    ))}
                {launcher.canAdd && (
                    <SettingsNavRow
                        label={t('settings.miniApp.add')}
                        hint={t('settings.miniApp.addHint', { max: MINI_APP_LINK_LIMIT })}
                        onClick={() => launcher.setEditing('new')}
                    />
                )}
            </SettingsRowGroup>

            <MiniAppLinkDialog
                editing={launcher.editing}
                onClose={() => launcher.setEditing(null)}
                onSave={launcher.saveLink}
                onRemove={launcher.removeLink}
            />
            <MiniAppConsentDialog host={launcher.pendingConsentHost} onAnswer={launcher.answerConsent} />
        </section>
    );
};

const saveError: Record<Exclude<MiniAppLinkSave, 'saved'>, { field: 'name' | 'url'; key: string }> = {
    nameMissing: { field: 'name', key: 'settings.miniApp.nameMissing' },
    nameTooLong: { field: 'name', key: 'settings.miniApp.nameTooLong' },
    invalidUrl: { field: 'url', key: 'settings.miniApp.linkInvalid' },
    hubUrl: { field: 'url', key: 'settings.miniApp.linkIsHub' },
    full: { field: 'url', key: 'settings.miniApp.full' },
    failed: { field: 'url', key: 'settings.miniApp.linkSaveFailed' },
};

type MiniAppLinkFormProps = {
    onClose: () => void;
    onSave: (name: string, url: string) => MiniAppLinkSave;
    onRemove: () => boolean;
};

const MiniAppLinkDialog = ({ editing, ...props }: { editing: MiniAppLinkEditing | null } & MiniAppLinkFormProps) => {
    const { t } = useTranslation();
    // Draw what it last edited while it closes, not a blank add form for the exit animation. The
    // content unmounts once closed, so the next opening still starts fresh.
    const [last, setLast] = useState(editing);
    if (editing !== null && editing !== last) setLast(editing);
    const shown = editing ?? last;
    const existing = shown !== null && shown !== 'new' ? shown : null;
    return (
        <Dialog open={editing !== null} onOpenChange={next => !next && props.onClose()}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t(existing ? 'settings.miniApp.editTitle' : 'settings.miniApp.add')}</DialogTitle>
                <DialogDescription>{t('settings.miniApp.linkHint')}</DialogDescription>
                {/* Keyed by what it edits, so each opening starts from that mini app (or blank) on its first paint. */}
                <MiniAppLinkForm key={existing?.id ?? 'new'} existing={existing} {...props} />
            </DialogContent>
        </Dialog>
    );
};

const MiniAppLinkForm = ({
    existing,
    onClose,
    onSave,
    onRemove,
}: { existing: MiniAppLink | null } & MiniAppLinkFormProps) => {
    const { t } = useTranslation();
    const [name, setName] = useState(existing?.name ?? '');
    const [url, setUrl] = useState(existing?.url ?? '');
    const [error, setError] = useState<{ field: 'name' | 'url'; message: string } | null>(null);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const outcome = onSave(name, url);
        if (outcome !== 'saved') {
            const { field, key } = saveError[outcome];
            setError({
                field,
                message: t(key, { max: field === 'name' ? MINI_APP_LINK_NAME_MAX : MINI_APP_LINK_LIMIT }),
            });
            return;
        }
        toast({ title: t('settings.miniApp.linkSaved') });
        onClose();
    };

    const handleRemove = () => {
        if (!onRemove()) {
            setError({ field: 'url', message: t('settings.miniApp.linkSaveFailed') });
            return;
        }
        toast({ title: t('settings.miniApp.linkRemoved') });
        onClose();
    };

    const nameError = error?.field === 'name' ? error.message : null;
    const urlError = error?.field === 'url' ? error.message : null;

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
            <FormField
                label={t('settings.miniApp.nameLabel')}
                htmlFor="mini-app-name"
                errorId="mini-app-name-error"
                invalid={nameError != null}
            >
                <Input
                    id="mini-app-name"
                    autoFocus
                    value={name}
                    onChange={e => {
                        setName(e.target.value);
                        setError(null);
                    }}
                />
            </FormField>
            {nameError && <FormError id="mini-app-name-error">{nameError}</FormError>}
            <FormField
                label={t('settings.miniApp.linkLabel')}
                htmlFor="mini-app-link"
                errorId="mini-app-link-error"
                invalid={urlError != null}
            >
                <Input
                    id="mini-app-link"
                    type="url"
                    value={url}
                    onChange={e => {
                        setUrl(e.target.value);
                        setError(null);
                    }}
                    placeholder="https://"
                />
            </FormField>
            {urlError && <FormError id="mini-app-link-error">{urlError}</FormError>}
            <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                {existing && (
                    <Button
                        type="button"
                        variant="outline"
                        className="text-destructive sm:mr-auto"
                        onClick={handleRemove}
                    >
                        {t('settings.miniApp.remove')}
                    </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose}>
                    {t('common.cancel')}
                </Button>
                <Button type="submit">{t('settings.miniApp.save')}</Button>
            </DialogFooter>
        </form>
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
