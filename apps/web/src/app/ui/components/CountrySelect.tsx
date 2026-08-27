import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconChevronDown } from '@chatic/web-ui-kit';

import { phoneCountryDialCode, type PhoneCountry } from '../../utils/phoneNumber';
import { CountrySelectSheet } from './CountrySelectSheet';

interface CountrySelectProps {
    value: PhoneCountry | null;
    onChange: (country: PhoneCountry) => void;
    disabled?: boolean;
}

/**
 * The country control that sits in a phone `TextField`'s `leading` slot: dial code + caret,
 * opening the search sheet.
 *
 * Trigger and sheet ship as one component so a consuming screen wires a country in a single prop
 * and never has to add a sibling node next to its form — `ContactInvitePage` in particular renders
 * one fixed child list on purpose (a branch that shifts child indices unmounts the live
 * `PhoneVerifySheet` mid-promotion), and a picker that is a prop cannot break that.
 *
 * Empty is a real state, not an error: with no country there is nothing to validate against, so the
 * screen's CTA is simply disabled and the trigger shows a placeholder (ADR-0044 §4).
 */
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
