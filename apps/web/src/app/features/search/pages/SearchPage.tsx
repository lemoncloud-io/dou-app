import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Cloud, MessageSquare } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { DefaultAvatar, ImageAvatar, SearchInput, UnreadBadge } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { HighlightText } from '../components/HighlightText';
import { RecentSearchList } from '../components/RecentSearchList';
import { ResultRow } from '../components/ResultRow';
import { formatResultContext } from '../lib/formatResultContext';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import {
    useSearchContext,
    type ChannelResultRow,
    type ChatResultRow,
    type PlaceResultRow,
} from '../hooks/useSearchContext';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useSearchNavigate } from '../hooks/useSearchNavigate';

const AVATAR_SIZE = 42;

/** Circular avatar shared by place and channel rows, matching the home list. */
const RowAvatar = ({ thumbnail }: { thumbnail?: string }) =>
    thumbnail ? <ImageAvatar src={thumbnail} alt="" size={AVATAR_SIZE} /> : <DefaultAvatar size={AVATAR_SIZE} />;

/** apps/web full-page search (see docs/specs/search/web-search-page.md, ADR-0033). */
export const SearchPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const [query, setQuery] = useState('');
    const { results, isSearching, hasResults, isQueryTooShort, cloudNamesByCid } = useGlobalSearch(query);
    const rows = useSearchContext(results, cloudNamesByCid);
    const { recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } = useRecentSearches();
    const { goTo } = useSearchNavigate();

    const trimmed = query.trim();
    const isIdle = trimmed.length === 0;

    // Same short HH:MM form the home list uses for a channel's last message.
    const formatTime = (value?: number) => {
        if (!value) return '';
        const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
        return new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    };

    const submit = (keyword: string) => {
        const value = keyword.trim();
        if (!value) return;
        addRecentSearch(value);
        setQuery(value);
    };

    const openCloud = (cloud: (typeof rows.clouds)[number]) => {
        submit(trimmed);
        void goTo(ROUTES.home, { cid: cloud.id });
    };

    // A place result switches to that place and lands on home — home renders the session's active
    // place, so the switch IS the destination (ADR-0033).
    const openPlace = (place: PlaceResultRow) => {
        submit(trimmed);
        void goTo(ROUTES.home, { cid: place.cid, sid: place.placeId });
    };

    const openChannel = (channel: ChannelResultRow) => {
        submit(trimmed);
        void goTo(ROUTES.channels.room(channel.channelId), { cid: channel.cid, sid: channel.sid });
    };

    // A chat row carries no `sid` of its own (CacheChatView has cid/channelId only) — `sid` here
    // comes from the owning channel resolved via the search context, and is simply absent when
    // that channel isn't cached, in which case the room still opens without a place switch.
    const openMessage = (chat: ChatResultRow) => {
        submit(trimmed);
        void goTo(`${ROUTES.channels.room(chat.channelId)}?chatNo=${chat.chatNo}`, {
            cid: chat.cid,
            sid: chat.sid,
        });
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
                        {rows.clouds.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.clouds', '클라우드')}
                                </h2>
                                {rows.clouds.map(cloud => (
                                    <ResultRow
                                        key={cloud.id}
                                        leading={
                                            <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground">
                                                <Cloud size={18} />
                                            </span>
                                        }
                                        title={<HighlightText text={cloud.name ?? ''} query={trimmed} />}
                                        onClick={() => openCloud(cloud)}
                                    />
                                ))}
                            </section>
                        )}

                        {rows.places.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.places', '플레이스')}
                                </h2>
                                {rows.places.map(place => (
                                    <ResultRow
                                        key={`${place.cid}:${place.placeId}`}
                                        leading={<RowAvatar thumbnail={place.thumbnail} />}
                                        title={<HighlightText text={place.name} query={trimmed} />}
                                        context={formatResultContext(place.cloudName)}
                                        onClick={() => openPlace(place)}
                                    />
                                ))}
                            </section>
                        )}

                        {rows.channels.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.channels', '채널')}
                                </h2>
                                {rows.channels.map(channel => (
                                    <ResultRow
                                        key={`${channel.cid}:${channel.channelId}`}
                                        leading={<RowAvatar thumbnail={channel.thumbnail} />}
                                        title={<HighlightText text={channel.name} query={trimmed} />}
                                        badge={
                                            (channel.memberNo ?? 0) > 1 ? (
                                                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                                                    {channel.memberNo}
                                                </span>
                                            ) : undefined
                                        }
                                        subtitle={channel.lastMessage}
                                        context={formatResultContext(channel.cloudName, channel.placeName)}
                                        trailing={
                                            <>
                                                <span className="text-[12px] leading-4 text-description">
                                                    {formatTime(channel.lastMessageAt)}
                                                </span>
                                                <UnreadBadge count={channel.unread} variant="pill" />
                                            </>
                                        }
                                        onClick={() => openChannel(channel)}
                                    />
                                ))}
                            </section>
                        )}

                        {rows.chats.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.chat', 'Chat')}
                                </h2>
                                {rows.chats.map(chat => (
                                    <ResultRow
                                        key={`${chat.cid}:${chat.chatId}`}
                                        leading={
                                            <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground">
                                                <MessageSquare size={18} />
                                            </span>
                                        }
                                        title={<HighlightText text={chat.content} query={trimmed} />}
                                        context={formatResultContext(chat.cloudName, chat.placeName, chat.channelName)}
                                        trailing={
                                            <span className="text-[12px] leading-4 text-description">
                                                {formatTime(chat.createdAt)}
                                            </span>
                                        }
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
