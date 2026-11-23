import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BottomSheet, IconCheck, SearchInput } from '@chatic/web-ui-kit';
import { cn } from '@chatic/ui-kit';

import { listPhoneCountries, type PhoneCountry } from '@chatic/shared/phone';

interface CountrySelectSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: PhoneCountry | null;
    onSelect: (country: PhoneCountry) => void;
}

export const CountrySelectSheet = ({ open, onOpenChange, value, onSelect }: CountrySelectSheetProps) => {
    const { t, i18n } = useTranslation();
    const [query, setQuery] = useState('');

    const countries = listPhoneCountries(i18n.language);

    useEffect(() => {
        if (open) setQuery('');
    }, [open]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return countries;
        return countries.filter(
            option =>
                option.name.toLowerCase().includes(needle) ||
                option.dialCode.includes(needle) ||
                option.code.toLowerCase().includes(needle)
        );
    }, [countries, query]);

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('phoneInput.countrySheetTitle')}
            onClose={() => onOpenChange(false)}
        >
            <div className="sticky top-0 z-10 bg-surface px-4 pb-2 pt-1">
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder={t('phoneInput.countrySearchPlaceholder')}
                    label={t('phoneInput.countrySearchPlaceholder')}
                />
            </div>

            {open && (
                <div className="flex flex-col pb-2">
                    {filtered.map(option => (
                        <button
                            key={option.code}
                            type="button"
                            onClick={() => {
                                onSelect(option.code);
                                onOpenChange(false);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left"
                        >
                            <span
                                className={cn(
                                    'min-w-0 flex-1 truncate text-[16px] font-medium text-foreground',
                                    value === option.code && 'text-point-blue'
                                )}
                            >
                                {option.name}
                            </span>
                            <span className="shrink-0 text-[15px] font-medium text-description">{option.dialCode}</span>
                            {value === option.code && (
                                <IconCheck className="size-[18px] shrink-0 text-point-blue" strokeWidth={2.5} />
                            )}
                        </button>
                    ))}

                    {filtered.length === 0 && (
                        <p className="px-4 py-10 text-center text-[14px] text-description">
                            {t('phoneInput.noResults')}
                        </p>
                    )}
                </div>
            )}
        </BottomSheet>
    );
};
