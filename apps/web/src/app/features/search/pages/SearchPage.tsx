import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChatResults, EmptyState, PlaceResults, RecentSearches, SearchInput } from '../components';
import { useRecentSearches, useSearch } from '../hooks';

export const SearchPage = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const { searches, addSearch, removeSearch, clearAll } = useRecentSearches();
    const { results, isSearching, hasResults } = useSearch(query);

    const handleSearchClick = (searchQuery: string) => {
        setQuery(searchQuery);
        addSearch(searchQuery);
    };

    const handleClose = () => {
        navigate(-1);
    };

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
    };

    const handleSubmit = () => {
        if (query.trim()) {
            addSearch(query.trim());
        }
    };

    const showResults = query.trim().length > 0;
    const showNoResults = showResults && !isSearching && !hasResults;

    return (
        <div className="flex min-h-screen flex-col bg-[#FBFCFD]">
            <SearchInput value={query} onChange={handleQueryChange} onSubmit={handleSubmit} onClose={handleClose} />

            <div className="flex flex-1 flex-col gap-1">
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
                        <PlaceResults places={results.places} />
                        <ChatResults chats={results.chats} />
                    </>
                )}

                {/* No Results */}
                {showNoResults && <EmptyState />}
            </div>
        </div>
    );
};
