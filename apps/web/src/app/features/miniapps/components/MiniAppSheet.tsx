import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainMiniApp } from '@chatic/runtime';
import { checkMiniAppLink } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { BottomSheet, Button, Switch, TextField } from '@chatic/web-ui-kit';

import { saveErrorOf, saveErrorOfProblem, type MiniAppSaveError } from '../utils/saveError';

/** The mini app the owner's sheet edits: one in the list, or `'new'` for one being added. */
export type MiniAppEditing = DomainMiniApp | 'new';

export interface MiniAppSheetFields {
    name: string;
    url: string;
    enabled: boolean;
}

interface FormProps {
    onClose: () => void;
    /** Save the form: add when `target` is `null`, else change `target`. Rejects as the save did. */
    onSubmit: (fields: MiniAppSheetFields, target: DomainMiniApp | null) => Promise<void>;
    onRemove: (target: DomainMiniApp) => Promise<void>;
}

/**
 * The owner's sheet to add a mini app or edit one: its name and address, whether members see it, and
 * (editing) removing it. A held mini app says so at the top and keeps its switch locked.
 */
export const MiniAppSheet = ({ editing, ...props }: { editing: MiniAppEditing | null } & FormProps) => {
    const { t } = useTranslation();
    // What the sheet last showed. Its content stays mounted while it slides away, so it keeps that
    // mini app (or the blank add form) until then rather than turning into another form on its way out.
    const [shown, setShown] = useState<MiniAppEditing>('new');
    if (editing !== null && editing !== shown) setShown(editing);
    const target = editing ?? shown;
    const existing = target !== 'new' ? target : null;
    return (
        <BottomSheet
            open={editing !== null}
            onOpenChange={next => !next && props.onClose()}
            title={t(existing ? 'miniApps.sheet.editTitle' : 'miniApps.sheet.addTitle')}
            description={t('miniApps.sheet.description')}
            closeLabel={t('common.close')}
        >
            {/* Keyed by what it edits, so each opening starts from that mini app (or blank) on its first paint. */}
            <MiniAppForm key={existing?.id ?? 'new'} existing={existing} {...props} />
        </BottomSheet>
    );
};

const MiniAppForm = ({ existing, onClose, onSubmit, onRemove }: { existing: DomainMiniApp | null } & FormProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const held = existing?.status === 'held';
    const [name, setName] = useState(existing?.name ?? '');
    const [url, setUrl] = useState(existing?.url ?? '');
    const [enabled, setEnabled] = useState(existing?.enabled ?? true);
    const [error, setError] = useState<MiniAppSaveError | null>(null);
    const [busy, setBusy] = useState(false);

    const clearError = () => setError(null);
    const messageFor = (field: 'name' | 'url') => (error?.field === field ? t(error.key, error.values) : undefined);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        // Checked by the same rule the relay applies, so most mistakes are caught before a round trip.
        const problem = checkMiniAppLink(name, url);
        if (problem) {
            setError(saveErrorOfProblem(problem));
            return;
        }
        setBusy(true);
        try {
            await onSubmit({ name: name.trim(), url: url.trim(), enabled }, existing);
        } catch (failure) {
            setError(saveErrorOf(failure));
            setBusy(false);
            return;
        }
        setBusy(false);
        toast({ title: t(existing ? 'miniApps.sheet.saved' : 'miniApps.sheet.added') });
        onClose();
    };

    // No confirmation, as in the Lab: the list is the owner's and a removed one is quickly added again.
    const handleRemove = async () => {
        if (!existing || busy) return;
        setBusy(true);
        try {
            await onRemove(existing);
        } catch {
            setBusy(false);
            toast({ title: t('miniApps.sheet.removeFailed'), variant: 'destructive' });
            return;
        }
        setBusy(false);
        toast({ title: t('miniApps.sheet.removed') });
        onClose();
    };

    const visibleHint = held
        ? 'miniApps.sheet.visibleHintHeld'
        : existing
          ? 'miniApps.sheet.visibleHintEdit'
          : 'miniApps.sheet.visibleHintAdd';

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-5 pt-2">
            {held && (
                <p
                    role="note"
                    className="rounded-[12px] bg-destructive/10 px-3.5 py-3 text-[14px] leading-[1.5] text-destructive"
                >
                    {t('miniApps.sheet.heldNotice')}
                </p>
            )}
            <TextField
                id="mini-app-name"
                label={t('miniApps.sheet.nameLabel')}
                value={name}
                onChange={next => {
                    setName(next);
                    clearError();
                }}
                error={messageFor('name')}
            />
            <TextField
                id="mini-app-url"
                label={t('miniApps.sheet.urlLabel')}
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                value={url}
                onChange={next => {
                    setUrl(next);
                    clearError();
                }}
                placeholder="https://"
                error={messageFor('url')}
            />
            <div className="flex min-h-[52px] items-center gap-3">
                <span className="flex flex-1 flex-col gap-0.5">
                    <span className={held ? 'text-[16px] text-description' : 'text-[16px] text-foreground'}>
                        {t('miniApps.sheet.visible')}
                    </span>
                    <span className="text-[13px] text-description">{t(visibleHint)}</span>
                </span>
                {/* A held mini app cannot be turned on by its owner, so the switch shows it off and locked. */}
                <Switch
                    checked={held ? false : enabled}
                    onCheckedChange={setEnabled}
                    disabled={held}
                    label={t('miniApps.sheet.visible')}
                />
            </div>
            <Button type="submit" fullWidth disabled={busy}>
                {t(existing ? 'miniApps.sheet.save' : 'miniApps.sheet.submitAdd')}
            </Button>
            {existing && (
                <Button
                    type="button"
                    variant="ghost"
                    fullWidth
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => void handleRemove()}
                >
                    {t('miniApps.sheet.remove')}
                </Button>
            )}
        </form>
    );
};
