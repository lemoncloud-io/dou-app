import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { Calendar } from 'lucide-react';
import { cn } from '@chatic/ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { PageHeader } from '../../../shared/components';
import { useMyPlaces } from '../../home/hooks/useMyPlaces';
import { useUpdateMyPlace } from '../../home/hooks/useUpdateMyPlace';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

const MAX_NAME_LENGTH = 20;

export const PlaceInfoPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { placeId } = useParams<{ placeId: string }>();
    const { places } = useMyPlaces();
    const { updatePlace, isPending } = useUpdateMyPlace();
    const [place, setPlace] = useState<MySiteView | null>(null);
    const [name, setName] = useState('');

    useEffect(() => {
        if (placeId && places.length > 0) {
            const found = places.find(p => p.id === placeId);
            setPlace(found ?? null);
            setName(found?.name ?? '');
        }
    }, [placeId, places]);

    const formatDate = useCallback(
        (timestamp?: number) => {
            if (!timestamp) return '-';
            const date = new Date(timestamp);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            if (i18n.language === 'ko') return `${year}년 ${month}월`;
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

    const isDirty = name !== (place?.name ?? '');
    const isNameValid = name.length > 0 && name.length <= MAX_NAME_LENGTH;
    const canSubmit = isDirty && isNameValid && !isPending;

    const handleSubmit = async () => {
        if (!canSubmit || !placeId) return;
        try {
            await updatePlace({ sid: placeId, name });
            navigate(-1);
        } catch (error) {
            toast({ title: t('common.error', '오류가 발생했습니다'), variant: 'destructive' });
        }
    };

    const title = t('placeInfo.title', '플레이스 정보');

    if (!place) {
        return (
            <div className="flex min-h-screen flex-col bg-white pt-safe-top">
                <PageHeader title={title} />
                <div className="flex flex-1 items-center justify-center">
                    <span className="text-[#84888F]">{t('placeInfo.notFound', '플레이스를 찾을 수 없습니다')}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-white pt-safe-top">
            <PageHeader title={title} />

            <div className="flex flex-1 flex-col gap-[10px] pt-[14px] px-4">
                {/* 만든 날짜 */}
                <div className="flex items-center gap-[14px]">
                    <div className="flex flex-1 items-center gap-3 rounded-lg px-4 py-3">
                        <Calendar size={22} className="shrink-0 text-[#53555B]" />
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[14px] font-semibold leading-[1.286] tracking-[0.5%] text-[#53555B]">
                                {t('placeInfo.createdDate', '만든 날짜')}
                            </span>
                            <span className="text-[16px] font-medium leading-[1.45] tracking-[-1.5%] text-[#222325]">
                                {formatDate(place.createdAt)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 구분선 */}
                <div className="mx-4 h-px bg-[#F4F5F5]" />

                {/* 이름 수정 */}
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-[6px]">
                        <span className="text-[14px] font-semibold leading-[1.286] tracking-[0.5%] text-[#53555B]">
                            {t('placeInfo.nameLabel', '이름 수정')}
                        </span>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center rounded-[10px] border border-[#EAEAEC] bg-white px-3 py-3">
                                <input
                                    className="flex-1 text-[16px] font-normal leading-[1.45] tracking-[-1.5%] text-[#222325] outline-none placeholder:text-[#BABCC0]"
                                    value={name}
                                    onChange={e => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                                    placeholder={t('placeInfo.namePlaceholder', '플레이스 이름을 입력해 주세요')}
                                />
                                <span
                                    className={cn(
                                        'text-[13px] font-medium leading-[1.385] tracking-[1.94%] text-[#53555B] opacity-74'
                                    )}
                                >
                                    {name.length}/{MAX_NAME_LENGTH}
                                </span>
                            </div>
                            <span className="pl-0.5 text-[12px] font-medium leading-[1.5] text-[#84888F]">
                                {t('placeInfo.nameDescription', '20글자 이내로 입력해 주세요.')}
                            </span>
                        </div>
                    </div>

                    {/* 사진 */}
                    <div className="flex flex-col gap-[10px]">
                        <div className="flex items-center gap-[3px]">
                            <span className="text-[14px] font-semibold leading-[1.286] tracking-[0.5%] text-[#53555B]">
                                {t('placeInfo.photoLabel', '사진')}
                            </span>
                            <span className="text-[13px] font-medium leading-[1.385] tracking-[0.5%] text-[#BABCC0]">
                                {t('placeInfo.photoOptional', '[선택]')}
                            </span>
                        </div>
                        <button className="flex size-[86px] items-center justify-center rounded-2xl border border-[#F4F5F5] bg-[#F7F7F7]">
                            {/* TODO: 이미지 업로드 */}
                        </button>
                    </div>
                </div>
            </div>

            {/* 완료 버튼 */}
            <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-5">
                <button
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className={cn(
                        'h-[50px] w-full rounded-full text-[16px] font-semibold leading-[22px] tracking-[0.08px]',
                        canSubmit ? 'bg-[#b0ea10] text-[#222325]' : 'bg-[#EAEAEC] text-[#BABCC0]'
                    )}
                >
                    {t('placeInfo.confirm', '완료')}
                </button>
            </div>
        </div>
    );
};
