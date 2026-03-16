import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { Calendar, ChevronLeft, Globe, Home, Lock, UserCheck, Users } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { useMyPlaces } from '../../home/hooks/useMyPlaces';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

interface HeaderProps {
    title: string;
    onBack: () => void;
}

const Header = ({ title, onBack }: HeaderProps) => (
    <header className="flex items-center justify-center px-4 py-3">
        <button onClick={onBack} className="absolute left-4 p-2">
            <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
        </button>
        <h1 className="text-[17px] font-semibold text-foreground">{title}</h1>
    </header>
);

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

    const title = t('placeInfo.title', '플레이스 정보');

    if (!place) {
        return (
            <div className="flex min-h-screen flex-col bg-background pt-safe-top">
                <Header title={title} onBack={handleBack} />
                <div className="flex flex-1 items-center justify-center">
                    <span className="text-muted-foreground">
                        {t('placeInfo.notFound', '플레이스를 찾을 수 없습니다')}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            <Header title={title} onBack={handleBack} />

            {/* Content */}
            <div className="flex flex-1 flex-col items-center px-6 pb-4 pt-6">
                {/* Place Icon */}
                <div className="flex size-[47px] items-center justify-center rounded-full bg-gradient-to-b from-[#E8E8E8] to-[#D0D0D0]">
                    <Home size={24} className="text-white" />
                </div>

                {/* Place Name + Owner Badge */}
                <div className="mt-3 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <Users size={16} className="text-muted-foreground" />
                        <span className="text-lg font-semibold text-foreground">
                            {place.name || t('placeInfo.unnamed', '이름 없는 플레이스')}
                        </span>
                    </div>
                    {place.isOwner && (
                        <span className="rounded-full bg-[#b0ea10] px-2.5 py-0.5 text-xs font-medium text-[#222325]">
                            {t('placeInfo.myPlace', '내 플레이스')}
                        </span>
                    )}
                </div>

                {/* Info Items */}
                <div className="mt-6 w-full space-y-4">
                    {/* Created Date */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                                {t('placeInfo.createdDate', '만든 날짜')}
                            </span>
                        </div>
                        <span className="pl-5 text-sm font-medium text-foreground">{formatDate(place.createdAt)}</span>
                    </div>

                    {/* Owner */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <UserCheck size={14} className="text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                                {t('placeInfo.owner', '플레이스 관리자')}
                            </span>
                        </div>
                        <span className="pl-5 text-sm font-medium text-foreground">
                            {place.owner$?.name || t('placeInfo.unknownOwner', '알 수 없음')}
                        </span>
                    </div>

                    {/* Public/Private Status */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            {place.isPublic ? (
                                <Globe size={14} className="text-muted-foreground" />
                            ) : (
                                <Lock size={14} className="text-muted-foreground" />
                            )}
                            <span className="text-sm text-muted-foreground">
                                {t('placeInfo.visibility', '공개 설정')}
                            </span>
                        </div>
                        <span className="pl-5 text-sm font-medium text-foreground">
                            {place.isPublic ? t('placeInfo.public', '공개') : t('placeInfo.private', '비공개')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer Button */}
            <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-4">
                <Button
                    onClick={handleBack}
                    className="h-12 w-full rounded-full bg-[#b0ea10] text-base font-semibold text-[#222325] hover:bg-[#9fd30e]"
                >
                    {t('placeInfo.confirm', '확인')}
                </Button>
            </div>
        </div>
    );
};
