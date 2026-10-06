import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';

import { AlertCircle } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    AlertDialog,
    CloudAvatar,
    FloatingButton,
    IconSpinner,
    ModalTopBar,
    ScreenLayout,
    SelectableCard,
} from '@chatic/web-ui-kit';

import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMarkDrops, useMembershipInfo } from '../../../hooks/useMembership';
import { ROUTES } from '../../../routes/paths';
import { usePlanCatalog } from '../hooks';
import {
    cloudDisplayName,
    findPlanById,
    formatDate,
    hasDropMarks,
    initialKeepIds,
    isSameKeepChoice,
    keepCandidates,
    needsKeepChoice,
    toDropIds,
    toggleKeep,
} from '../lib';

/**
 * "유지할 클라우드 선택" — after a downgrade, which clouds stay once the allowance shrinks (Figma
 * 4537-15842 · 4564-22355 · 4564-23171 first choice, 4564-23375 · 4564-23577 · 4565-24236 changing it).
 *
 * The relay asks the opposite question: `POST /memberships/0/drops` takes the clouds to give up, and
 * its list is the final state. The screen asks what to keep, because that is the choice a person
 * makes, and sends everything else. Nothing happens on save — the relay holds the unchosen clouds
 * when the downgrade actually lands at renewal, and the choice can be changed until then, even
 * after, while they are on hold.
 *
 * The target plan is the queued one from the membership. Straight after the purchase the relay may
 * not have read the new receipt yet, so the confirm screen passes the plan along as `?plan=` too.
 */
export const KeepCloudsPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const [params] = useSearchParams();

    const { data: membership, isLoading: isMembershipLoading } = useMembershipInfo();
    const { pendingPlan, sellablePlans, isLoading: isCatalogLoading } = usePlanCatalog();
    const { data: cloudsData, isLoading: isCloudsLoading } = useClouds({ limit: -1 });
    const markDrops = useMarkDrops();

    const [picked, setPicked] = useState<string[] | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const isLoading = isMembershipLoading || isCatalogLoading || isCloudsLoading;
    const target = pendingPlan ?? findPlanById(sellablePlans, params.get('plan'));
    const limit = target?.maxClouds;
    const candidates = keepCandidates(cloudsData?.list ?? []);

    // Nothing to choose — no change queued, or everything fits — goes back to the detail.
    if (!isLoading && (typeof limit !== 'number' || !needsKeepChoice(candidates.length, limit))) {
        return <Navigate to={ROUTES.subscription.detail} replace />;
    }
    if (isLoading || typeof limit !== 'number') {
        return (
            <div className="flex h-screen items-center justify-center">
                <IconSpinner className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const saved = initialKeepIds(candidates);
    const isChange = hasDropMarks(candidates);
    const selection = picked ?? saved;
    const canSubmit =
        selection.length === limit && !markDrops.isPending && !(isChange && isSameKeepChoice(selection, saved));
    // The date the downgrade lands. A purchase this moment old may not show it yet; the dash then is
    // honest rather than a guessed renewal date.
    const changeDate = formatDate(membership?.validUntil);

    const submit = async () => {
        setIsConfirmOpen(false);
        try {
            // The response's `excess` is owned clouds against the CURRENT plan's allowance, not
            // against the marks, so it says nothing about whether this choice is complete — the
            // selection count above is what guarantees that.
            await markDrops.mutateAsync({ cloudIds: toDropIds(candidates, selection) });
            toast({ title: t('mypage.subscription.keep.saved') });
            navigate(ROUTES.subscription.detail, { replace: true });
        } catch (error) {
            logger.error('CLOUD', 'saving clouds to keep failed', { error });
            toast({ title: t('mypage.subscription.keep.failed'), variant: 'destructive' });
        }
    };

    return (
        <>
            <ScreenLayout
                className="h-screen"
                header={
                    <ModalTopBar
                        safeArea
                        title={t('mypage.subscription.keep.title')}
                        onClose={() => navigate(-1)}
                        closeLabel={t('common.close')}
                    />
                }
                footer={
                    <FloatingButton
                        label={isChange ? t('mypage.subscription.keep.change') : t('mypage.subscription.keep.confirm')}
                        onClick={() => setIsConfirmOpen(true)}
                        disabled={!canSubmit}
                        loading={markDrops.isPending}
                    />
                }
            >
                <div className="flex flex-col gap-2 pb-6">
                    <div className="flex flex-col gap-4 px-4 py-6 text-center">
                        <h1 className="whitespace-pre-line text-[20px] font-semibold leading-[1.35] text-foreground">
                            {t('mypage.subscription.keep.headline', { count: limit })}
                        </h1>
                        <p className="text-[14px] font-medium leading-[1.45] text-description">
                            {t('mypage.subscription.keep.description', { date: changeDate })}
                        </p>
                    </div>

                    <section className="flex flex-col gap-2" aria-labelledby="keep-clouds-section">
                        <h2
                            id="keep-clouds-section"
                            className="px-4 py-2 text-[16px] font-semibold leading-[18px] text-foreground"
                        >
                            {t('mypage.subscription.keep.section')}
                        </h2>
                        <div
                            role={limit === 1 ? 'radiogroup' : 'group'}
                            aria-labelledby="keep-clouds-section"
                            className="flex flex-col gap-[18px] px-4 py-2"
                        >
                            {candidates.map(cloud => {
                                const id = cloud.id as string;
                                const name = cloudDisplayName(cloud);
                                return (
                                    <SelectableCard
                                        key={id}
                                        title={name}
                                        leading={<CloudAvatar name={name} size="md" />}
                                        // "Selected" names what the relay holds now, not the pending tap —
                                        // it is how a returning user sees the choice they already made.
                                        trailingLabel={
                                            isChange && saved.includes(id)
                                                ? t('mypage.subscription.keep.selected')
                                                : undefined
                                        }
                                        checked={selection.includes(id)}
                                        onToggle={() => setPicked(toggleKeep(selection, id, limit))}
                                    />
                                );
                            })}
                        </div>
                    </section>

                    <div className="flex items-start gap-2 px-4 pt-4">
                        <AlertCircle size={18} className="mt-0.5 shrink-0 text-description" />
                        <p className="text-[15px] font-medium leading-[1.3] text-point-blue">
                            {t('mypage.subscription.keep.notice')}
                        </p>
                    </div>
                </div>
            </ScreenLayout>

            <AlertDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title={isChange ? t('mypage.subscription.keep.changeTitle') : t('mypage.subscription.keep.keepTitle')}
                description={
                    <span className="whitespace-pre-line">
                        {t('mypage.subscription.keep.dialogDescription', { date: changeDate })}
                    </span>
                }
                cancelLabel={t('common.cancel')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => void submit()}
            />
        </>
    );
};
