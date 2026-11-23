import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconChevronDown } from '@chatic/web-ui-kit';

import { phoneCountryDialCode, type PhoneCountry } from '@chatic/shared/phone';
import { CountrySelectSheet } from './CountrySelectSheet';

interface CountrySelectProps {
    value: PhoneCountry | null;
    onChange: (country: PhoneCountry) => void;
    disabled?: boolean;
}

export const CountrySelect = ({ value, onChange, disabled = false }: CountrySelectProps) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const dialCode = value ? phoneCountryDialCode(value) : null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={disabled}
                aria-label={t('phoneInput.countrySheetTitle')}
                className="flex items-center gap-1 text-[16px] font-medium text-foreground disabled:text-placeholder"
            >
                {value ? (
                    <span>{dialCode ?? value}</span>
                ) : (
                    <span className="text-placeholder">{t('phoneInput.countryPlaceholder')}</span>
                )}
                <IconChevronDown className="size-4 shrink-0 text-description" />
            </button>

            <CountrySelectSheet
                open={open}
                onOpenChange={setOpen}
                value={value}
                onSelect={country => {
                    onChange(country);
                    setOpen(false);
                }}
            />
        </>
    );
};
