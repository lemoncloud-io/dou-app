import { ChevronLeft, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '../../../shared/hooks';

import { useMyChannels } from '../../home/hooks/useMyChannels';
import { useMyPlaces } from '../../home/hooks/useMyPlaces';

export const SearchPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const [query, setQuery] = useState('');

    const { places } = useMyPlaces();
    const { channels } = useMyChannels();

    const lowerQuery = query.toLowerCase();
    const filteredPlaces = places.filter(p => p.name?.toLowerCase().includes(lowerQuery));
    const filteredChannels = channels.filter(c => c.name?.toLowerCase().includes(lowerQuery));
    const hasResults = filteredPlaces.length > 0 || filteredChannels.length > 0;

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            <header className="flex items-center gap-2 px-4 py-3">
                <button onClick={() => navigate(-1)} className="p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
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

            {query && (
                <div className="space-y-6 px-5 pt-4">
                    {!hasResults && (
                        <p className="text-center text-sm text-muted-foreground">{t('search.noResults')}</p>
                    )}

                    {filteredPlaces.length > 0 && (
                        <div>
                            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('search.places')}</h3>
                            <div className="space-y-0">
                                {filteredPlaces.map(place => (
                                    <button
                                        key={place.id}
                                        className="flex w-full items-center gap-3 rounded-lg px-1 py-3 active:bg-muted"
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm">
                                            <span role="img" aria-label="place">
                                                🏠
                                            </span>
                                        </div>
                                        <span className="text-[15px] font-medium text-foreground">{place.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {filteredChannels.length > 0 && (
                        <div>
                            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('search.chat')}</h3>
                            <div className="space-y-0">
                                {filteredChannels.map(channel => (
                                    <button
                                        key={channel.id}
                                        onClick={() => navigate(`/chats/${channel.id}`)}
                                        className="flex w-full items-center gap-3 rounded-lg px-1 py-3 active:bg-muted"
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm">
                                            <span role="img" aria-label="chat">
                                                💬
                                            </span>
                                        </div>
                                        <span className="text-[15px] font-medium text-foreground">
                                            {channel.name || t('channelList.unnamedChannel')}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
