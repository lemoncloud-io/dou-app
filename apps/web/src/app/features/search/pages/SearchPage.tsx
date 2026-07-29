import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Cloud, Hash, MapPin, MessageSquare } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { SearchInput } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { HighlightText } from '../components/HighlightText';
import { RecentSearchList } from '../components/RecentSearchList';
import { ResultRow } from '../components/ResultRow';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useSearchNavigate } from '../hooks/useSearchNavigate';

/** apps/web full-page search (see docs/specs/search/web-search-page.md, ADR-0033). */
export const SearchPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const [query, setQuery] = useState('');
    const { results, isSearching, hasResults, isQueryTooShort } = useGlobalSearch(query);
    const { recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } = useRecentSearches();
    const { goTo } = useSearchNavigate();

    const trimmed = query.trim();
    const isIdle = trimmed.length === 0;

    const submit = (keyword: string) => {
        const value = keyword.trim();
        if (!value) return;
        addRecentSearch(value);
        setQuery(value);
    };

    const openCloud = (cloud: (typeof results.clouds)[number]) => {
        submit(trimmed);
        void goTo(ROUTES.home, { cid: cloud.id });
    };

    const openPlace = (place: (typeof results.places)[number]) => {
        submit(trimmed);
        void goTo(ROUTES.place.detail(place.id), { cid: place.cid });
    };

    const openChannel = (channel: (typeof results.channels)[number]) => {
        submit(trimmed);
        void goTo(ROUTES.channels.room(channel.id), { cid: channel.cid });
    };

    const openMessage = (chat: (typeof results.messages)[number]) => {
        submit(trimmed);
        void goTo(`${ROUTES.channels.room(chat.channelId)}?chatNo=${chat.chatNo}`, { cid: chat.cid });
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <div className="flex items-center gap-1 px-2 py-2">
                <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder={t('search.placeholder', '방 이름, 플레이스명으로 검색')}
                    label={t('search.placeholder', '방 이름, 플레이스명으로 검색')}
                    autoFocus
                    onKeyDown={event => {
                        if (event.key === 'Enter') submit(query);
                    }}
                />
            </div>

            <div className="flex-1 overflow-y-auto">
                {isIdle ? (
                    <RecentSearchList
                        keywords={recentSearches}
                        onSelect={setQuery}
                        onRemove={removeRecentSearch}
                        onClearAll={clearRecentSearches}
                    />
                ) : isQueryTooShort ? null : !isSearching && !hasResults ? (
                    <p className="px-4 py-10 text-center text-sm text-description">
                        {t('search.noResults', '검색 결과가 없습니다.')}
                    </p>
                ) : (
                    <div className="flex flex-col">
                        {results.clouds.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.clouds', '클라우드')}
                                </h2>
                                {results.clouds.map(cloud => (
                                    <ResultRow
                                        key={cloud.id}
                                        icon={<Cloud size={18} />}
                                        title={<HighlightText text={cloud.name ?? ''} query={trimmed} />}
                                        onClick={() => openCloud(cloud)}
                                    />
                                ))}
                            </section>
                        )}

                        {results.places.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.places', '플레이스')}
                                </h2>
                                {results.places.map(place => (
                                    <ResultRow
                                        key={place.id}
                                        icon={<MapPin size={18} />}
                                        title={<HighlightText text={place.name ?? ''} query={trimmed} />}
                                        onClick={() => openPlace(place)}
                                    />
                                ))}
                            </section>
                        )}

                        {results.channels.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.channels', '채널')}
                                </h2>
                                {results.channels.map(channel => (
                                    <ResultRow
                                        key={channel.id}
                                        icon={<Hash size={18} />}
                                        title={<HighlightText text={channel.name ?? ''} query={trimmed} />}
                                        onClick={() => openChannel(channel)}
                                    />
                                ))}
                            </section>
                        )}

                        {results.messages.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.chat', 'Chat')}
                                </h2>
                                {results.messages.map(chat => (
                                    <ResultRow
                                        key={chat.id}
                                        icon={<MessageSquare size={18} />}
                                        title={<HighlightText text={chat.content ?? ''} query={trimmed} />}
                                        onClick={() => openMessage(chat)}
                                    />
                                ))}
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
