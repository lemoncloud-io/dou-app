import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type PayerDraft, isMobilePhone, isPayerName } from '../lib/payer';
import { cn } from '../utils';

const INPUT =
    'h-12 rounded-xl border bg-white px-4 text-[15px] text-navy outline-none placeholder:text-subtitle/60 ' +
    'focus:border-navy/40';

/**
 * The cardholder's name and mobile number, which the card company requires with every card. Drawn in
 * W-08's form-row style, and reused where a card is added later — nothing typed here is kept, so each
 * card asks again. A field says what is wrong with it only once the reader has left it.
 */
export const PayerFields = ({
    value,
    onChange,
    idPrefix,
}: {
    value: PayerDraft;
    onChange: (next: PayerDraft) => void;
    idPrefix: string;
}): JSX.Element => {
    const { t } = useTranslation();
    const [touched, setTouched] = useState({ name: false, phone: false });
    const nameError = touched.name && !isPayerName(value.name);
    const phoneError = touched.phone && !isMobilePhone(value.phone);

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <label htmlFor={`${idPrefix}-name`} className="text-[13px] text-desc-alt">
                        {t('subscription.common.payer.name')}
                    </label>
                    <input
                        id={`${idPrefix}-name`}
                        autoComplete="name"
                        aria-required
                        aria-invalid={nameError}
                        className={cn(INPUT, nameError ? 'border-status-danger' : 'border-border')}
                        placeholder={t('subscription.common.payer.namePlaceholder')}
                        value={value.name}
                        onChange={event => onChange({ ...value, name: event.target.value })}
                        onBlur={() => setTouched(current => ({ ...current, name: true }))}
                    />
                    {nameError && (
                        <p role="alert" className="text-xs text-status-danger">
                            {t('subscription.common.payer.nameInvalid')}
                        </p>
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <label htmlFor={`${idPrefix}-phone`} className="text-[13px] text-desc-alt">
                        {t('subscription.common.payer.phone')}
                    </label>
                    <input
                        id={`${idPrefix}-phone`}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        aria-required
                        aria-invalid={phoneError}
                        className={cn(INPUT, phoneError ? 'border-status-danger' : 'border-border')}
                        placeholder={t('subscription.common.payer.phonePlaceholder')}
                        value={value.phone}
                        onChange={event => onChange({ ...value, phone: event.target.value })}
                        onBlur={() => setTouched(current => ({ ...current, phone: true }))}
                    />
                    {phoneError && (
                        <p role="alert" className="text-xs text-status-danger">
                            {t('subscription.common.payer.phoneInvalid')}
                        </p>
                    )}
                </div>
            </div>
            <p className="text-[13px] text-subtitle">{t('subscription.common.payer.note')}</p>
        </div>
    );
};
