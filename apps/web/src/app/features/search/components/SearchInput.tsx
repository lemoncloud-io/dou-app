import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onClose: () => void;
}

export const SearchInput = ({ value, onChange, onSubmit, onClose }: SearchInputProps) => {
    const { t } = useTranslation();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            onSubmit();
        }
    };

    return (
        <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex flex-1 items-center gap-[9px] rounded-[30px] border border-[rgba(0,43,126,0.01)] bg-[rgba(0,43,126,0.03)] px-[14px] py-[10px]">
                <button onClick={onSubmit} className="shrink-0">
                    <Search size={18} className="text-muted-foreground" />
                </button>
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('search.placeholder')}
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.015em] text-foreground outline-none placeholder:text-muted-foreground"
                />
                {value && (
                    <button
                        onClick={() => onChange('')}
                        className="shrink-0 rounded-full p-0.5 text-[rgba(60,60,67,0.3)] transition-colors hover:text-muted-foreground"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>
            <button onClick={onClose} className="shrink-0 p-2">
                <X size={24} strokeWidth={2} className="text-foreground" />
            </button>
        </div>
    );
};
