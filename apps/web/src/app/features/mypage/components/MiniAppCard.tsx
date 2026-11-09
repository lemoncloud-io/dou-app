import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { AlertDialog, BottomSheet, Button, IconChevronRight, ListRow, MenuCard, TextField } from '@chatic/web-ui-kit';

import { useSubWebViewOpenScope } from '../../../bridge/shellCapabilities';
import { type MiniAppLinkSave, type MiniAppOpenOutcome, useMiniAppLauncher } from '../hooks/useMiniAppLauncher';

/**
 * The Lab's mini app card. Drawn only in an app whose handshake says it opens any https page
 * (`subWebViewOpenScope: 'anyHttps'`): an older app and a browser tab never see it, because they would
 * refuse the owner's link. The launcher's own hooks run only past that check.
 */
export const MiniAppCard = () => {
    const scope = useSubWebViewOpenScope();
    return scope === 'anyHttps' ? <MiniAppSection /> : null;
};

const MiniAppSection = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const launcher = useMiniAppLauncher({
        onOpened: (outcome: MiniAppOpenOutcome) => {
            if (outcome === 'failed') toast({ title: t('mypage.lab.miniApp.openFailed'), variant: 'destructive' });
            if (outcome === 'outside') toast({ title: t('mypage.lab.miniApp.openedOutside') });
        },
    });
    if (!launcher.available) return null;

    const linkHost = launcher.link ? new URL(launcher.link).host : null;
    const chevron = <IconChevronRight className="size-[18px] text-description" />;

    return (
        <>
            <MenuCard title={t('mypage.lab.miniApp.title')}>
                <ListRow
                    title={t('mypage.lab.miniApp.open')}
                    subtitle={linkHost ?? t('mypage.lab.miniApp.openHubHint')}
                    trailing={chevron}
                    onClick={launcher.open}
                />
                {launcher.isOwner && (
                    <ListRow
                        title={t('mypage.lab.miniApp.link')}
                        subtitle={launcher.link ?? t('mypage.lab.miniApp.linkUnset')}
                        trailing={chevron}
                        onClick={() => launcher.setLinkSettingsOpen(true)}
                    />
                )}
            </MenuCard>

            <MiniAppLinkDialog
                open={launcher.isLinkSettingsOpen}
                onOpenChange={launcher.setLinkSettingsOpen}
                link={launcher.link}
                onSave={launcher.saveLink}
            />
            <MiniAppConsentDialog host={launcher.pendingConsentHost} onAnswer={launcher.answerConsent} />
        </>
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
    const { toast } = useToast();
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
            setError(t('mypage.lab.miniApp.linkInvalid'));
            return;
        }
        if (outcome === 'failed') {
            setError(t('mypage.lab.miniApp.linkSaveFailed'));
            return;
        }
        toast({ title: t(value.trim() ? 'mypage.lab.miniApp.linkSaved' : 'mypage.lab.miniApp.linkRemoved') });
        onOpenChange(false);
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('mypage.lab.miniApp.link')}
            description={t('mypage.lab.miniApp.linkHint')}
            closeLabel={t('common.close')}
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-5 pt-2">
                <TextField
                    id="mini-app-link"
                    label={t('mypage.lab.miniApp.linkLabel')}
                    type="url"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={value}
                    onChange={next => {
                        setValue(next);
                        setError(null);
                    }}
                    placeholder="https://"
                    error={error ?? undefined}
                />
                <Button type="submit" fullWidth>
                    {t('mypage.lab.miniApp.save')}
                </Button>
            </form>
        </BottomSheet>
    );
};

/** A yes/no that blocks until answered: closing it any other way is a no. */
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
