import { Children, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MINI_APP_LINK_LIMIT, MINI_APP_LINK_NAME_MAX, type MiniAppLink } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { AlertDialog, BottomSheet, Button, IconChevronRight, ListRow, MenuCard, TextField } from '@chatic/web-ui-kit';

import { useSubWebViewOpenScope } from '../../../bridge/shellCapabilities';
import {
    type MiniAppLinkEditing,
    type MiniAppLinkSave,
    type MiniAppOpenOutcome,
    useMiniAppLauncher,
} from '../hooks/useMiniAppLauncher';

type MiniAppCardProps = {
    children?: ReactNode;
    withLauncher: boolean;
};

export const MiniAppCard = ({ children, withLauncher }: MiniAppCardProps) => {
    const scope = useSubWebViewOpenScope();
    if (withLauncher && scope === 'anyHttps') return <MiniAppSection>{children}</MiniAppSection>;
    return <PagesOnlyCard>{children}</PagesOnlyCard>;
};

const PagesOnlyCard = ({ children }: { children?: ReactNode }) => {
    const { t } = useTranslation();
    if (Children.count(children) === 0) return null;
    return <MenuCard title={t('mypage.lab.miniApp.title')}>{children}</MenuCard>;
};

const chevron = <IconChevronRight className="size-[18px] text-description" />;

const MiniAppSection = ({ children }: { children?: ReactNode }) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const launcher = useMiniAppLauncher({
        onOpened: (outcome: MiniAppOpenOutcome) => {
            if (outcome === 'failed') toast({ title: t('mypage.lab.miniApp.openFailed'), variant: 'destructive' });
            if (outcome === 'outside') toast({ title: t('mypage.lab.miniApp.openedOutside') });
        },
    });
    if (!launcher.available) return <PagesOnlyCard>{children}</PagesOnlyCard>;
    const count = launcher.links.length;

    return (
        <>
            <MenuCard title={t('mypage.lab.miniApp.title')}>
                <ListRow
                    title={t('mypage.lab.miniApp.open')}
                    subtitle={
                        count > 0 ? t('mypage.lab.miniApp.openHint', { count }) : t('mypage.lab.miniApp.openHubHint')
                    }
                    trailing={chevron}
                    onClick={launcher.openHub}
                />
                {children}
                {launcher.isOwner &&
                    launcher.links.map(link => (
                        <ListRow
                            key={link.id}
                            title={link.name}
                            subtitle={t('mypage.lab.miniApp.manageHint', { host: new URL(link.url).host })}
                            trailing={chevron}
                            onClick={() => launcher.setEditing(link)}
                        />
                    ))}
                {launcher.canAdd && (
                    <ListRow
                        title={t('mypage.lab.miniApp.add')}
                        subtitle={t('mypage.lab.miniApp.addHint', { max: MINI_APP_LINK_LIMIT })}
                        trailing={chevron}
                        onClick={() => launcher.setEditing('new')}
                    />
                )}
            </MenuCard>

            <MiniAppLinkSheet
                editing={launcher.editing}
                onClose={() => launcher.setEditing(null)}
                onSave={launcher.saveLink}
                onRemove={launcher.removeLink}
            />
            <MiniAppConsentDialog host={launcher.pendingConsentHost} onAnswer={launcher.answerConsent} />
        </>
    );
};

const saveError: Record<Exclude<MiniAppLinkSave, 'saved'>, { field: 'name' | 'url'; key: string }> = {
    nameMissing: { field: 'name', key: 'mypage.lab.miniApp.nameMissing' },
    nameTooLong: { field: 'name', key: 'mypage.lab.miniApp.nameTooLong' },
    invalidUrl: { field: 'url', key: 'mypage.lab.miniApp.linkInvalid' },
    hubUrl: { field: 'url', key: 'mypage.lab.miniApp.linkIsHub' },
    full: { field: 'url', key: 'mypage.lab.miniApp.full' },
    failed: { field: 'url', key: 'mypage.lab.miniApp.linkSaveFailed' },
};

type MiniAppLinkFormProps = {
    onClose: () => void;
    onSave: (name: string, url: string) => MiniAppLinkSave;
    onRemove: () => boolean;
};

const MiniAppLinkSheet = ({ editing, ...props }: { editing: MiniAppLinkEditing | null } & MiniAppLinkFormProps) => {
    const { t } = useTranslation();
    const [shown, setShown] = useState<MiniAppLinkEditing>('new');
    if (editing !== null && editing !== shown) setShown(editing);
    const target = editing ?? shown;
    const existing = target !== 'new' ? target : null;
    return (
        <BottomSheet
            open={editing !== null}
            onOpenChange={next => !next && props.onClose()}
            title={t(existing ? 'mypage.lab.miniApp.editTitle' : 'mypage.lab.miniApp.add')}
            description={t('mypage.lab.miniApp.linkHint')}
            closeLabel={t('common.close')}
        >
            <MiniAppLinkForm key={existing?.id ?? 'new'} existing={existing} {...props} />
        </BottomSheet>
    );
};

const MiniAppLinkForm = ({
    existing,
    onClose,
    onSave,
    onRemove,
}: { existing: MiniAppLink | null } & MiniAppLinkFormProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
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
        toast({ title: t('mypage.lab.miniApp.linkSaved') });
        onClose();
    };

    const handleRemove = () => {
        if (!onRemove()) {
            setError({ field: 'url', message: t('mypage.lab.miniApp.linkSaveFailed') });
            return;
        }
        toast({ title: t('mypage.lab.miniApp.linkRemoved') });
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-5 pt-2">
            <TextField
                id="mini-app-name"
                label={t('mypage.lab.miniApp.nameLabel')}
                value={name}
                onChange={next => {
                    setName(next);
                    setError(null);
                }}
                error={error?.field === 'name' ? error.message : undefined}
            />
            <TextField
                id="mini-app-link"
                label={t('mypage.lab.miniApp.linkLabel')}
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                value={url}
                onChange={next => {
                    setUrl(next);
                    setError(null);
                }}
                placeholder="https://"
                error={error?.field === 'url' ? error.message : undefined}
            />
            <Button type="submit" fullWidth>
                {t('mypage.lab.miniApp.save')}
            </Button>
            {existing && (
                <Button type="button" variant="ghost" fullWidth className="text-destructive" onClick={handleRemove}>
                    {t('mypage.lab.miniApp.remove')}
                </Button>
            )}
        </form>
    );
};

const MiniAppConsentDialog = ({ host, onAnswer }: { host: string | null; onAnswer: (agreed: boolean) => void }) => {
    const { t } = useTranslation();
    return (
        <AlertDialog
            open={host !== null}
            onOpenChange={next => !next && onAnswer(false)}
            title={t('mypage.lab.miniApp.consentTitle')}
            description={t('mypage.lab.miniApp.consentBody', { host: host ?? '' })}
            cancelLabel={t('common.cancel')}
            confirmLabel={t('mypage.lab.miniApp.consentAgree')}
            onConfirm={() => onAnswer(true)}
        />
    );
};
