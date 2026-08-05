import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BottomSheet, IconCheck, SearchInput } from '@chatic/web-ui-kit';
import { cn } from '@chatic/lib/utils';

import { listPhoneCountries, toFlagEmoji, type PhoneCountry } from '../../utils/phoneNumber';

interface CountrySelectSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Currently selected country, or `null` while the field is still empty. */
    value: PhoneCountry | null;
    onSelect: (country: PhoneCountry) => void;
}

/**
 * Country picker for a phone field — every country the number metadata knows (245), searchable.
 *
 * `LanguageSelectSheet` is not a model for this: two options fit in a plain `SheetOption` list,
 * 245 need a search box, and each row here carries three things (flag, name, dial code) where
 * `SheetOption` takes one label. Both differences are why this draws its own rows.
 *
 * The search box is the scroll container's first child, pinned with `sticky` — deliberately, rather
 * than growing a `header` prop on `BottomSheet`: the kit change this feature needed was the
 * `TextField` `leading` slot, and one is cheaper to own than two.
 *
 * No virtualization. 245 plain buttons is not a list that needs it, the repo has no virtual-scroll
 * dependency, and `channels/InvitePage` already renders its contact list with a bare `.map()`.
 */
export const CountrySelectSheet = ({ open, onOpenChange, value, onSelect }: CountrySelectSheetProps) => {
    const { t, i18n } = useTranslation();
    const [query, setQuery] = useState('');

    const countries = listPhoneCountries(i18n.language);

    // Reopening starts from the whole list — a stale filter would look like a broken sheet.
    useEffect(() => {
        if (open) setQuery('');
    }, [open]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return countries;
        // Dial codes are searched with the `+` intact so both `81` and `+81` land on Japan, and the
        // ISO code is searched too so `jp` works while the names are localized to Korean.
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

            {/* `open` gates the row list itself, not just `BottomSheet`'s visibility: `children` is
                evaluated by THIS component before `BottomSheet` ever sees it, so without this guard
                every keystroke in the phone field (which re-renders this closed sheet alongside it)
                would still rebuild all 245 rows for no visible effect. */}
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
                            {/* Platforms that do not draw regional-indicator pairs show "KR"; the name
                                beside it means nothing is lost there. */}
                            <span className="w-7 shrink-0 text-[20px] leading-none">{toFlagEmoji(option.code)}</span>
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
