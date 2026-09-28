import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface RecentSearchListProps {
    keywords: string[];
    onSelect: (keyword: string) => void;
    onRemove: (keyword: string) => void;
    onClearAll: () => void;
}

export const RecentSearchList = ({ keywords, onSelect, onRemove, onClearAll }: RecentSearchListProps) => {
    const { t } = useTranslation();

    if (keywords.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-description">{t('search.noHistory')}</p>;
    }

    return (
        <div>
            <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs font-medium text-description">{t('search.recent')}</span>
                <button type="button" onClick={onClearAll} className="text-xs text-description underline">
                    {t('search.clearAll')}
                </button>
            </div>
            <ul>
                {keywords.map(keyword => (
                    <li key={keyword} className="flex items-center gap-2 px-4 py-2">
                        <button
                            type="button"
                            onClick={() => onSelect(keyword)}
                            className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                        >
                            {keyword}
                        </button>
                        <button
                            type="button"
                            aria-label={t('search.removeRecent')}
                            onClick={() => onRemove(keyword)}
                            className="shrink-0 p-1 text-description"
                        >
                            <X className="size-4" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
