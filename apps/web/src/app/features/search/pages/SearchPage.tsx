import { ChevronLeft, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const recentSearches = ['개발 모임', '스터디', '디자인', 'React'];

export const SearchPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [query, setQuery] = useState('');

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center gap-2 px-4 pb-3 pt-3">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <div className="flex flex-1 items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
                    <Search size={18} className="text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('search.placeholder')}
                        autoFocus
                        className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {query && (
                        <button onClick={() => setQuery('')}>
                            <X size={16} className="text-muted-foreground" />
                        </button>
                    )}
                </div>
            </header>

            {/* Recent Searches */}
            {!query && (
                <div className="px-5 pt-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-foreground">{t('search.recent')}</h2>
                        <button className="text-xs text-muted-foreground">{t('search.clearAll')}</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {recentSearches.map(tag => (
                            <button
                                key={tag}
                                onClick={() => setQuery(tag)}
                                className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-sm text-foreground"
                            >
                                {tag}
                                <X size={14} className="text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Search Results */}
            {query && (
                <div className="space-y-6 px-5 pt-4">
                    <div>
                        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('search.places')}</h3>
                        <div className="space-y-0">
                            {['개발자 모임', '디자인 스터디'].map(ws => (
                                <button
                                    key={ws}
                                    className="flex w-full items-center gap-3 rounded-lg px-1 py-3 active:bg-muted"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm">
                                        <span role="img" aria-label="place">
                                            🏠
                                        </span>
                                    </div>
                                    <span className="text-[15px] font-medium text-foreground">{ws}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('search.chat')}</h3>
                        <div className="space-y-0">
                            {['개발 모임방', 'React 스터디'].map(room => (
                                <button
                                    key={room}
                                    className="flex w-full items-center gap-3 rounded-lg px-1 py-3 active:bg-muted"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm">
                                        <span role="img" aria-label="chat">
                                            💬
                                        </span>
                                    </div>
                                    <span className="text-[15px] font-medium text-foreground">{room}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
