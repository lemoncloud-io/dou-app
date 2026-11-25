import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Label } from '@chatic/ui-kit';

import { useRelayAccount } from '../../../shared';
import { ACCOUNT_NAME_MAX } from '../../account/components/AccountProfileDialog';

interface NewAccountNameProps {
    onDone: () => void;
    secondary?: ReactNode;
}

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
