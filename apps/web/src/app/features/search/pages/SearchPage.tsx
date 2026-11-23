import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Cloud, MessageSquare } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { DefaultAvatar, IconImageSolid, ImageAvatar, SearchInput, UnreadBadge } from '@chatic/web-ui-kit';

import { resolveThreadTarget } from '../../../bridge/navigation/resolveThreadTarget';
import { ROUTES } from '../../../routes/paths';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { HighlightText } from '../components/HighlightText';
import { RecentSearchList } from '../components/RecentSearchList';
import { ResultRow, ResultRowSkeleton } from '../components/ResultRow';
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

const RowAvatar = ({ thumbnail, variant = 'user' }: { thumbnail?: string; variant?: 'user' | 'group' }) =>
    thumbnail ? (
        <ImageAvatar src={thumbnail} alt="" size={AVATAR_SIZE} />
    ) : (
        <DefaultAvatar size={AVATAR_SIZE} variant={variant} />
    );

const PlaceRowAvatar = ({ thumbnail }: { thumbnail?: string }) =>
    thumbnail ? (
        <ImageAvatar src={thumbnail} alt="" size={AVATAR_SIZE} />
    ) : (
        <IconImageSolid size={AVATAR_SIZE} className="text-brand-ink dark:text-white/80" />
    );

export const SearchPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const [searchParams, setSearchParams] = useSearchParams();
    const [query, setQueryState] = useState(() => searchParams.get('q') ?? '');

    const setQuery = useCallback(
        (value: string) => {
            setQueryState(value);
            setSearchParams(
                params => {
                    if (value) params.set('q', value);
                    else params.delete('q');
                    return params;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );
    const { results, isSearching, hasResults, isQueryTooShort, activeCloudName } = useGlobalSearch(query);
    const rows = useSearchContext(results);
    const { recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } = useRecentSearches();
    const { goTo } = useSearchNavigate();

    const trimmed = query.trim();
    const isIdle = trimmed.length === 0;

    const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
    const formatStamp = (value?: number) => {
        if (!value) return undefined;
        const at = new Date(value);
        return {
            date: at.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }),
            time: at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        };
    };

    const Stamp = ({ value }: { value?: number }) => {
        const stamp = formatStamp(value);
        if (!stamp) return null;
        return (
            <span className="flex flex-col items-end text-[11px] leading-4 text-description">
                <span>{stamp.date}</span>
                <span>{stamp.time}</span>
            </span>
        );
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

    const openPlace = (place: PlaceResultRow) => {
        submit(trimmed);
        void goTo(ROUTES.home, { cid: place.cid, sid: place.placeId });
    };

    const openChannel = (channel: ChannelResultRow) => {
        submit(trimmed);
        void goTo(ROUTES.channels.room(channel.channelId), { cid: channel.cid, sid: channel.sid });
    };

    const openMessage = (chat: ChatResultRow) => {
        submit(trimmed);
        const room = ROUTES.channels.room(chat.channelId);
        const jump = chat.chatNo > 0 ? `?chatNo=${chat.chatNo}` : '';
        const thread = resolveThreadTarget(chat, chat.chatId);
        void goTo(`${thread ?? room}${jump}`, { cid: chat.cid, sid: chat.sid });
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <div className="flex items-center gap-1 px-2 py-2">
                <button type="button" onClick={() => navigate(-1)} aria-label={t('common.back')} className="p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder={t('search.placeholder')}
                    label={t('search.placeholder')}
                    autoFocus
                    onKeyDown={event => {
                        if (event.key === 'Enter') submit(query);
                    }}
                />
            </div>

            <p className="px-4 pb-2 text-[11px] leading-4 text-description">
                {activeCloudName ? t('search.scopeNoticeNamed', { cloud: activeCloudName }) : t('search.scopeNotice')}
            </p>

            <div className="flex-1 overflow-y-auto">
                {isIdle ? (
                    <RecentSearchList
                        keywords={recentSearches}
                        onSelect={setQuery}
                        onRemove={removeRecentSearch}
                        onClearAll={clearRecentSearches}
                    />
                ) : isQueryTooShort ? null : isSearching && !hasResults ? (
                    <div className="flex flex-col" role="status" aria-busy="true">
                        <span className="sr-only">{t('search.searching')}</span>
                        <ResultRowSkeleton />
                        <ResultRowSkeleton />
                        <ResultRowSkeleton />
                    </div>
                ) : !hasResults ? (
                    <p className="px-4 py-10 text-center text-sm text-description">{t('search.noResults')}</p>
                ) : (
                    <div className="flex flex-col">
                        {rows.clouds.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">{t('search.clouds')}</h2>
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
                                <h2 className="px-4 py-2 text-xs font-medium text-description">{t('search.places')}</h2>
                                {rows.places.map(place => (
                                    <ResultRow
                                        key={`${place.cid}:${place.placeId}`}
                                        leading={<PlaceRowAvatar thumbnail={place.thumbnail} />}
                                        title={<HighlightText text={place.name} query={trimmed} />}
                                        onClick={() => openPlace(place)}
                                    />
                                ))}
                            </section>
                        )}

                        {rows.channels.length > 0 && (
                            <section>
                                <h2 className="px-4 py-2 text-xs font-medium text-description">
                                    {t('search.channels')}
                                </h2>
                                {rows.channels.map(channel => (
                                    <ResultRow
                                        key={`${channel.cid}:${channel.channelId}`}
                                        leading={<RowAvatar thumbnail={channel.thumbnail} variant={channel.glyph} />}
                                        title={<HighlightText text={channel.name} query={trimmed} />}
                                        badge={
                                            (channel.memberNo ?? 0) > 1 ? (
                                                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                                                    {channel.memberNo}
                                                </span>
                                            ) : undefined
                                        }
                                        subtitle={channel.lastMessage}
                                        context={formatResultContext(channel.placeName)}
                                        trailing={
                                            <>
                                                <Stamp value={channel.lastMessageAt} />
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
                                <h2 className="px-4 py-2 text-xs font-medium text-description">{t('search.chat')}</h2>
                                {rows.chats.map(chat => (
                                    <ResultRow
                                        key={`${chat.cid}:${chat.chatId}`}
                                        leading={
                                            chat.senderThumbnail || chat.senderName ? (
                                                <RowAvatar thumbnail={chat.senderThumbnail} />
                                            ) : (
                                                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground">
                                                    <MessageSquare size={18} />
                                                </span>
                                            )
                                        }
                                        title={chat.senderName ?? t('search.unknownSender')}
                                        subtitle={<HighlightText text={chat.content} query={trimmed} />}
                                        context={formatResultContext(chat.placeName, chat.channelName)}
                                        trailing={<Stamp value={chat.createdAt} />}
                                        onClick={() => openMessage(chat)}
                                    />
                                ))}
                            </section>
                        )}
                    </div>
                )}
                <SafeAreaBottomSpacer />
            </div>
        </div>
    );
};
