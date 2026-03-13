import { Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

interface PlaceResultsProps {
    places: MySiteView[];
    onSelect?: (place: MySiteView) => void;
}

export const PlaceResults = ({ places, onSelect }: PlaceResultsProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const handleClick = (place: MySiteView) => {
        if (onSelect) {
            onSelect(place);
        } else {
            navigate(`/chats/${place.id}/room`);
        }
    };

    if (places.length === 0) return null;

    return (
        <div className="px-4 py-2">
            <div className="overflow-hidden rounded-[18px] bg-white p-4 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-2">
                    <Home size={18} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-[16px] font-semibold tracking-[-0.02em] text-foreground">
                        {t('search.places')}
                    </span>
                </div>
                <div className="mt-3 flex gap-3 overflow-x-auto">
                    {places.map(place => (
                        <button
                            key={place.id}
                            onClick={() => place.id && handleClick(place)}
                            className="flex shrink-0 flex-col items-center gap-[5px]"
                        >
                            <div className="relative size-[47px]">
                                <div className="absolute left-[3px] top-[3px] flex size-[41px] items-center justify-center rounded-full bg-gradient-to-br from-[#E8E8E8] to-[#D0D0D0]">
                                    <Home size={19} className="text-[#666]" />
                                </div>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <span className="max-w-[80px] truncate text-[14px] tracking-[-0.018em] text-foreground">
                                    {place.name || 'Place'}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
