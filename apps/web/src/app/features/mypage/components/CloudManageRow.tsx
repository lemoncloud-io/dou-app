import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import {
    CloudAvatar,
    CloudStatusBadge,
    type CloudStatusVariant,
    IconChevronRight,
    IconSpinner,
    ListRow,
} from '@chatic/web-ui-kit';
import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { type CloudRowState, cloudDisplayName, needsCloudAttention, resolveCloudRowState } from '../../../utils';

interface CloudManageRowProps {
    cloud: CloudView;
    onOpen: (cloudId: string) => void;
}

const BADGE: Record<CloudRowState, { variant: CloudStatusVariant; key: string } | null> = {
    provisioning: { variant: 'provisioning', key: 'provisioning' },
    setupFailed: { variant: 'failed', key: 'setupFailed' },
    dropScheduled: { variant: 'ending', key: 'ending' },
    restricted: { variant: 'restricted', key: 'restricted' },
    released: null,
    ready: null,
};

export const CloudManageRow = ({ cloud, onOpen }: CloudManageRowProps) => {
    const { t } = useTranslation();
    const state = resolveCloudRowState(cloud);
    const badge = BADGE[state];
    const name = cloudDisplayName(cloud);
    const isRestricted = state === 'restricted';

    return (
        <ListRow
            leading={<CloudAvatar name={name} size="md" />}
            title={<span className={cn('truncate', isRestricted && 'text-placeholder')}>{name}</span>}
            subtitle={
                needsCloudAttention(state) ? (
                    <span className={cn(isRestricted && 'text-placeholder')}>{t('mypage.cloudManage.checkInfo')}</span>
                ) : undefined
            }
            trailing={
                <span className="flex items-center gap-1.5">
                    {state === 'provisioning' && <IconSpinner className="size-5 animate-spin text-point-blue" />}
                    {badge && (
                        <CloudStatusBadge variant={badge.variant} label={t(`mypage.cloudManage.status.${badge.key}`)} />
                    )}
                    <IconChevronRight className="size-[18px] text-description" />
                </span>
            }
            onClick={cloud.id ? () => onOpen(cloud.id as string) : undefined}
            className={cn('px-[6px] py-2', isRestricted && 'rounded-[12px] bg-secondary')}
        />
    );
};
