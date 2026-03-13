import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';

import { useRecentSearches, useSearch } from '../hooks';
import { ChatResults } from './ChatResults';
import { EmptyState } from './EmptyState';
import { PlaceResults } from './PlaceResults';
import { RecentSearches } from './RecentSearches';
import { SearchInput } from './SearchInput';

interface SearchModalProps {
    open: boolean;
    onClose: () => void;
}

export const SearchModal = ({ open, onClose }: SearchModalProps) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const { searches, addSearch, removeSearch, clearAll } = useRecentSearches();
    const { results, isSearching, hasResults } = useSearch(query);

    const handleSearchClick = (searchQuery: string) => {
        setQuery(searchQuery);
        addSearch(searchQuery);
    };

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
    };

    const handleSubmit = () => {
        if (query.trim()) {
            addSearch(query.trim());
        }
    };

    const handleSelect = (channelId: string) => {
        onClose();
        navigate(`/chats/${channelId}/room`);
    };

    const handleClose = () => {
        setQuery('');
        onClose();
    };

    const showResults = query.trim().length > 0;
    const showNoResults = showResults && !isSearching && !hasResults;

    return (
        <Dialog open={open} onOpenChange={isOpen => !isOpen && handleClose()}>
            <DialogContent variant="slide-up" hideClose className="flex flex-col gap-0 bg-[#FBFCFD]">
                <SearchInput value={query} onChange={handleQueryChange} onSubmit={handleSubmit} onClose={handleClose} />

                <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                    {/* Recent Searches - always show */}
                    <RecentSearches
                        searches={searches}
                        onSearchClick={handleSearchClick}
                        onRemove={removeSearch}
                        onClearAll={clearAll}
                    />

                    {/* Search Results */}
                    {showResults && !showNoResults && (
                        <>
                            <PlaceResults places={results.places} onSelect={handleSelect} />
                            <ChatResults chats={results.chats} onSelect={handleSelect} />
                        </>
                    )}

                    {/* No Results */}
                    {showNoResults && <EmptyState />}
                </div>
            </DialogContent>
        </Dialog>
    );
};
