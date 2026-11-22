import { useFilterBarStrings } from '../i18n/screens/FilterBar';
import { EMPTY_FILTER, type RecordFilter } from '../lib/dataQuery';

export interface FilterBarProps {
    filter: RecordFilter;
    onChange: (next: RecordFilter) => void;
    /** How many records pass and how many there are. */
    shown: number;
    total: number;
    /** The fields offered in the field and sort pickers. */
    fields: readonly string[];
}

const inputClass = 'rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground';

/**
 * Search, one field filter and a sort, picked from controls — the Storage and DB screens share it.
 * What each control means is `lib/dataQuery`'s to say.
 */
export const FilterBar = ({ filter, onChange, shown, total, fields }: FilterBarProps) => {
    const t = useFilterBarStrings();
    const set = (patch: Partial<RecordFilter>) => onChange({ ...filter, ...patch });

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <input
                    type="search"
                    value={filter.text}
                    onChange={e => set({ text: e.target.value })}
                    placeholder={t.searchPlaceholder}
                    aria-label={t.search}
                    className={`min-w-0 flex-1 ${inputClass}`}
                />
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground" aria-live="polite">
                    {t.shown(shown, total)}
                </span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                    {t.field}
                    <select value={filter.field} onChange={e => set({ field: e.target.value })} className={`max-w-[9rem] ${inputClass}`}>
                        <option value="">{t.anyField}</option>
                        {fields.map(field => (
                            <option key={field} value={field}>
                                {field}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex min-w-[6rem] flex-1 flex-col gap-0.5 text-[10px] text-muted-foreground">
                    {t.value}
                    <input
                        value={filter.value}
                        disabled={!filter.field}
                        onChange={e => set({ value: e.target.value })}
                        className={`${inputClass} disabled:opacity-50`}
                    />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                    {t.sortBy}
                    <select
                        value={filter.sortField}
                        onChange={e => set({ sortField: e.target.value })}
                        className={`max-w-[9rem] ${inputClass}`}
                    >
                        <option value="">{t.noSort}</option>
                        {fields.map(field => (
                            <option key={field} value={field}>
                                {field}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    disabled={!filter.sortField}
                    aria-pressed={filter.descending}
                    onClick={() => set({ descending: !filter.descending })}
                    className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                    {filter.descending ? t.descending : t.ascending}
                </button>
                <button
                    type="button"
                    onClick={() => onChange(EMPTY_FILTER)}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground"
                >
                    {t.reset}
                </button>
            </div>
        </div>
    );
};
