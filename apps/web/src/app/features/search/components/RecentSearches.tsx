import { Clock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RecentSearchesProps {
    searches: string[];
    onSearchClick: (query: string) => void;
    onRemove: (query: string) => void;
    onClearAll: () => void;
}

export const RecentSearches = ({ searches, onSearchClick, onRemove, onClearAll }: RecentSearchesProps) => {
    const { t } = useTranslation();

    return (
        <div className="px-4 py-2">
            <div className="rounded-[18px] bg-card p-4 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-2">
                    <Clock size={18} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-[16px] font-semibold tracking-[-0.02em] text-foreground">
                        {t('search.recent')}
                    </span>
                    {searches.length > 0 && (
                        <button
                            onClick={onClearAll}
                            className="shrink-0 text-[15px] tracking-[-0.02em] text-muted-foreground"
                        >
                            {t('search.clearAll')}
                        </button>
                    )}
                </div>
                <div className="mt-3">
                    {searches.length === 0 ? (
                        <p className="text-[15px] leading-[18px] tracking-[-0.005em] text-muted-foreground">
                            {t('search.noHistory')}
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-[2px] overflow-hidden">
                            {searches.map(search => (
                                <div key={search} className="flex items-center gap-[3px] bg-card px-1">
                                    <button
                                        onClick={() => onSearchClick(search)}
                                        className="text-[15px] font-medium leading-[18px] tracking-[-0.005em] text-foreground"
                                    >
                                        {search}
                                    </button>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            onRemove(search);
                                        }}
                                        className="shrink-0 text-muted-foreground"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
