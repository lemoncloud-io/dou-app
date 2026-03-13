import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { Calendar, ChevronLeft, Home, UserCheck, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useMyPlaces } from '../../home/hooks/useMyPlaces';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

export const PlaceInfoPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { placeId } = useParams<{ placeId: string }>();
    const { places } = useMyPlaces();
    const [place, setPlace] = useState<MySiteView | null>(null);

    useEffect(() => {
        if (placeId && places.length > 0) {
            const found = places.find(p => p.id === placeId);
            setPlace(found ?? null);
        }
    }, [placeId, places]);

    const formatDate = useCallback(
        (timestamp?: number) => {
            if (!timestamp) return '-';
            const date = new Date(timestamp);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;

            if (i18n.language === 'ko') {
                return `${year}년 ${month}월`;
            }
            const monthNames = [
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
            ];
            return `${monthNames[month - 1]} ${year}`;
        },
        [i18n.language]
    );

    const handleBack = () => {
        navigate(-1);
    };

    const handleConfirm = () => {
        navigate(-1);
    };

    if (!place) {
        return (
            <div className="flex min-h-screen flex-col bg-white">
                <header className="flex h-11 items-center px-1.5">
                    <button onClick={handleBack} className="flex size-11 items-center justify-center">
                        <ChevronLeft size={24} className="text-[#222325]" />
                    </button>
                    <span className="flex-1 text-center text-base font-semibold text-[#222325]">
                        {t('placeInfo.title', '플레이스 정보')}
                    </span>
                    <div className="size-11" />
                </header>
                <div className="flex flex-1 items-center justify-center">
                    <span className="text-[#53555b]">{t('placeInfo.notFound', '플레이스를 찾을 수 없습니다')}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-white">
            {/* Header */}
            <header className="flex h-11 items-center px-1.5">
                <button onClick={handleBack} className="flex size-11 items-center justify-center">
                    <ChevronLeft size={24} className="text-[#222325]" />
                </button>
                <span className="flex-1 text-center text-base font-semibold text-[#222325]">
                    {t('placeInfo.title', '플레이스 정보')}
                </span>
                <div className="size-11" />
            </header>

            {/* Content */}
            <div className="flex flex-1 flex-col items-center px-6 pb-4 pt-6">
                {/* Place Icon */}
                <div
                    className={cn(
                        'flex h-[47px] w-[47px] items-center justify-center rounded-full',
                        'bg-gradient-to-b from-[#E8E8E8] to-[#D0D0D0]'
                    )}
                >
                    <Home size={24} className="text-white" />
                </div>

                {/* Place Name */}
                <div className="mt-3 flex items-center gap-1.5">
                    <Users size={16} className="text-[#53555b]" />
                    <span className="text-lg font-semibold text-[#222325]">
                        {place.name || t('placeInfo.unnamed', '이름 없는 플레이스')}
                    </span>
                </div>

                {/* Info Items */}
                <div className="mt-6 w-full space-y-4">
                    {/* Created Date */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-[#53555b]" />
                            <span className="text-sm text-[#53555b]">{t('placeInfo.createdDate', '만든 날짜')}</span>
                        </div>
                        <span className="pl-5 text-sm font-medium text-[#222325]">{formatDate(place.createdAt)}</span>
                    </div>

                    {/* Owner */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <UserCheck size={14} className="text-[#53555b]" />
                            <span className="text-sm text-[#53555b]">{t('placeInfo.owner', '플레이스 관리자')}</span>
                        </div>
                        <span className="pl-5 text-sm font-medium text-[#222325]">
                            {place.owner$?.name || t('placeInfo.unknownOwner', '알 수 없음')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer Button */}
            <div
                className="px-4 pb-safe-bottom pt-4"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            >
                <Button
                    onClick={handleConfirm}
                    className="h-12 w-full rounded-full bg-[#b0ea10] text-base font-semibold text-[#222325] hover:bg-[#9fd30e]"
                >
                    {t('placeInfo.confirm', '확인')}
                </Button>
            </div>
        </div>
    );
};
