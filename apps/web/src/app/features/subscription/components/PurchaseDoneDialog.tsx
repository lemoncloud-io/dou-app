import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Button, KeyValueRows, ModalTopBar, ScreenLayout, type KeyValueRow } from '@chatic/web-ui-kit';
import type { MembershipView } from '@lemoncloud/chatic-backend-api';

import { formatDate, platformLabelKey, type TierChangeKind } from '../lib';
import { NoticeList } from './NoticeList';

export interface PurchaseDoneDialogProps {
    membership: MembershipView | null;
    kind: Extract<TierChangeKind, 'new' | 'upgrade' | 'downgrade'>;
    productName: string;
    price?: string;
    isTrial: boolean;
    notices: string[];
    primary?: { label: string; onClick: () => void };
    onDone: () => void;
}

export const PurchaseDoneDialog = ({
    membership,
    kind,
    productName,
    price,
    isTrial,
    notices,
    primary,
    onDone,
}: PurchaseDoneDialogProps) => {
    const { t } = useTranslation();
    const validUntil = formatDate(membership?.validUntil);
    const platformKey = platformLabelKey(membership?.platform);

    const title =
        kind === 'new'
            ? t('mypage.subscription.done.newTitle')
            : t('mypage.subscription.done.changedTitle', { product: productName });

    const rows: Array<KeyValueRow | false> =
        kind === 'downgrade'
            ? [
                  {
                      key: 'status',
                      label: t('mypage.subscription.info.status'),
                      value: t('mypage.subscription.state.scheduled'),
                      tone: 'warning',
                  },
                  { key: 'applyOn', label: t('mypage.subscription.info.applyOn'), value: validUntil },
                  { key: 'chargeOn', label: t('mypage.subscription.info.chargeOn'), value: validUntil },
                  !!price && {
                      key: 'scheduledPrice',
                      label: t('mypage.subscription.info.scheduledPrice'),
                      value: price,
                      tone: 'accent',
                  },
              ]
            : [
                  {
                      key: 'status',
                      label: t('mypage.subscription.info.status'),
                      value: t('mypage.subscription.state.active'),
                      tone: 'info',
                  },
                  {
                      key: 'period',
                      label: t('mypage.subscription.info.period'),
                      value: `${formatDate(membership?.validFrom)}~${validUntil}`,
                  },
                  isTrial
                      ? { key: 'trialEndsOn', label: t('mypage.subscription.info.trialEndsOn'), value: validUntil }
                      : {
                            key: 'paidOn',
                            label: t('mypage.subscription.info.paidOn'),
                            value: formatDate(membership?.renewedAt || membership?.validFrom),
                        },
                  !!price && { key: 'price', label: t('mypage.subscription.info.price'), value: price, tone: 'accent' },
              ];
    const platformRow: KeyValueRow | false = !!platformKey && {
        key: 'platform',
        label: t('mypage.subscription.info.platform'),
        value: t(platformKey),
    };

    return (
        <Dialog open={!!membership} onOpenChange={open => !open && onDone()}>
            <DialogContent className="top-[50%] h-full max-h-none max-w-app rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogDescription className="sr-only">{t('mypage.subscription.detail.infoTitle')}</DialogDescription>
                <ScreenLayout
                    header={<ModalTopBar safeArea onClose={onDone} closeLabel={t('common.close')} />}
                    footer={
                        <div className="flex flex-col gap-3 px-4 pb-4 pt-4">
                            {primary && (
                                <Button size="lg" fullWidth onClick={primary.onClick}>
                                    {primary.label}
                                </Button>
                            )}
                            <Button variant="outline" size="lg" fullWidth onClick={onDone}>
                                {t('common.confirm')}
                            </Button>
                        </div>
                    }
                >
                    <div className="flex flex-col gap-6 pb-6 pt-4">
                        <div className="flex flex-col items-center gap-2 px-4 text-center">
                            <h1 className="whitespace-pre-line text-[20px] font-semibold leading-[1.35] text-foreground">
                                {title}
                            </h1>
                            {kind === 'downgrade' && (
                                <p className="whitespace-pre-line text-[14px] leading-[1.45] text-description">
                                    {t('mypage.subscription.done.scheduledDescription', {
                                        date: validUntil,
                                        product: productName,
                                    })}
                                </p>
                            )}
                        </div>
                        <section className="flex flex-col gap-2">
                            <h2 className="px-4 py-2 text-[16px] font-semibold text-foreground">
                                {t('mypage.subscription.detail.infoTitle')}
                            </h2>
                            <div className="px-4">
                                <KeyValueRows
                                    rows={[...rows, platformRow].filter((row): row is KeyValueRow => !!row)}
                                />
                            </div>
                        </section>
                        <NoticeList items={notices} />
                    </div>
                </ScreenLayout>
            </DialogContent>
        </Dialog>
    );
};
