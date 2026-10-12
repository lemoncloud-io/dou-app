import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { useRelayAccount } from '../../../shared';
import { ACCOUNT_NAME_MAX } from '../../account/components/AccountProfileDialog';

interface NewAccountNameProps {
    /** The step is over: the name was saved, or skipped. */
    onDone: () => void;
    /** Another way out, under the main button (the Google notice's "not my account"). */
    secondary?: ReactNode;
}

/**
 * The name a just-made account goes by. Asked right away because the account otherwise appears as
 * "unnamed" everywhere until someone finds the profile editor. Empty is allowed: continuing without a
 * name is the skip, and a failed save offers to carry on without it rather than holding the person here.
 */
export const NewAccountName = ({ onDone, secondary }: NewAccountNameProps) => {
    const { t } = useTranslation();
    const { updateAccount, isRelayVerified } = useRelayAccount();
    const inputId = useId();
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const trimmed = name.trim();

    const submit = async () => {
        if (!trimmed || failed) {
            onDone();
            return;
        }
        setSaving(true);
        try {
            await updateAccount({ name: trimmed });
            onDone();
        } catch {
            setFailed(true);
            setSaving(false);
        }
    };

    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={e => {
                e.preventDefault();
                void submit();
            }}
        >
            <div className="flex flex-col gap-1.5">
                <Label htmlFor={inputId}>{t('account.profile.nameLabel')}</Label>
                <Input
                    id={inputId}
                    autoFocus
                    value={name}
                    maxLength={ACCOUNT_NAME_MAX}
                    onChange={e => {
                        setName(e.target.value);
                        setFailed(false);
                    }}
                    disabled={saving}
                />
            </div>
            {failed && (
                <p role="alert" className="break-keep text-callout text-destructive">
                    {t('auth.newAccount.saveFailed')}
                </p>
            )}
            {/* A name waits for the relay connection to sign in as the new account; skipping never does. */}
            <Button type="submit" size="lg" disabled={saving || (!!trimmed && !failed && !isRelayVerified)}>
                {failed
                    ? t('auth.newAccount.continueWithout')
                    : trimmed
                      ? t('auth.phone.continue')
                      : t('auth.newAccount.skip')}
            </Button>
            {secondary}
        </form>
    );
};
