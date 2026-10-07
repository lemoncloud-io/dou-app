import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
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

/** The badge each row state wears, and its word. `null` is a plain row. */
const BADGE: Record<CloudRowState, { variant: CloudStatusVariant; key: string } | null> = {
    provisioning: { variant: 'provisioning', key: 'provisioning' },
    setupFailed: { variant: 'failed', key: 'setupFailed' },
    dropScheduled: { variant: 'ending', key: 'ending' },
    restricted: { variant: 'restricted', key: 'restricted' },
    released: null,
    ready: null,
};

/**
 * One owned cloud on the management list — the Figma "DoU/Cloud Row" (4897:15154): avatar, name,
 * the state badge, and a chevron into the cloud's own screens.
 *
 * Every row opens, whatever its state. A provisioning cloud has nothing to manage yet, but its
 * information screen is where the wait is explained; a failed or held one is exactly the row the
 * user has to open, because releasing it happens there. The caption under a row that needs a look
 * is the design's one sentence, not the state — the badge already says which state it is.
 */
export const CloudManageRow = ({ cloud, onOpen }: CloudManageRowProps) => {
    const { t } = useTranslation();
    const state = resolveCloudRowState(cloud);
    const badge = BADGE[state];
    const name = cloudDisplayName(cloud);
    const isRestricted = state === 'restricted';

    return (
        <ListRow
            leading={<CloudAvatar name={name} size="md" />}
            // Held rows grey their text; the span carries its own colour so it wins over the
            // row's default foreground.
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
