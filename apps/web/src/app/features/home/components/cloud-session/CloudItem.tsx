import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import {
    CloudAvatar,
    CloudStatusBadge,
    type CloudStatusVariant,
    IconCheckCircleSolid,
    IconChevronRight,
    IconSpinner,
} from '@chatic/web-ui-kit';
import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { type CloudRowState, isCloudEnterable, needsCloudAttention, resolveCloudRowState } from '../../../../utils';
import { CloudUnreadBadge } from './CloudUnreadBadge';
import { SELECTED_HIGHLIGHT, getCloudDisplayName } from './shared';

/** The badge each row state wears in the switcher, and its word. `null` is a plain row. */
const BADGE: Record<CloudRowState, { variant: CloudStatusVariant; key: string } | null> = {
    provisioning: { variant: 'provisioning', key: 'statusProvisioning' },
    setupFailed: { variant: 'failed', key: 'statusFailed' },
    dropScheduled: { variant: 'ending', key: 'statusEnding' },
    restricted: { variant: 'restricted', key: 'statusRestricted' },
    released: null,
    ready: null,
};

interface CloudItemProps {
    cloud: CloudView;
    isSelected: boolean;
    isDisabled: boolean;
    /** presence badge: any unread across this cloud's places (last-visited snapshot). */
    hasUnread?: boolean;
    onSelectCloud: (cloudId: string) => void;
    /** Raised instead of `onSelectCloud` for a row that cannot be entered — it opens cloud management. */
    onInspectCloud: (cloudId: string) => void;
}

/**
 * One owned-cloud row of the switcher — the Figma "DoU/Cloud Row" (4887-15268): avatar, name, the
 * state badge and, for a row that has something to explain, the one-line caption and a chevron
 * into cloud management.
 *
 * A row either enters its cloud or explains itself, never both. A live cloud (ready, or scheduled
 * to end at the next renewal — still usable until then) switches; every other state has no
 * session to switch to, so the tap opens the cloud's management hub instead, where the state is
 * explained, a failed cloud is set up again or released, and a held cloud is released. Renaming is NOT offered here — `/mypage/
 * cloud-manage/:id/edit` is the single rename path.
 */
export const CloudItem = ({
    cloud,
    isSelected,
    isDisabled,
    hasUnread,
    onSelectCloud,
    onInspectCloud,
}: CloudItemProps) => {
    const { t } = useTranslation();
    const state = resolveCloudRowState(cloud);
    const enterable = isCloudEnterable(state);
    const attention = needsCloudAttention(state);
    const badge = BADGE[state];
    const isRestricted = state === 'restricted';
    const displayName = getCloudDisplayName(cloud);
    const hasName = !!displayName;
    // A row that explains itself stays tappable whatever else is going on; only a switch in flight
    // or the row already being the session blocks it.
    const disabled = isDisabled || isSelected;

    const handleClick = () => {
        if (disabled || !cloud.id) return;
        if (!enterable) {
            onInspectCloud(cloud.id);
            return;
        }
        onSelectCloud(cloud.id);
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                isRestricted && 'bg-secondary',
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <CloudAvatar name={displayName} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {hasName ? (
                    // `min-w-0` + `truncate` on the NAME only: a long cloud name is clipped with an
                    // ellipsis while the unread badge stays fully visible (Figma 3486:25664).
                    <div className="flex min-w-0 items-center gap-[6px]">
                        <span
                            className={cn(
                                'truncate text-[15px] font-medium leading-[1.19] tracking-[-0.02em]',
                                isRestricted ? 'text-placeholder' : 'text-foreground'
                            )}
                        >
                            {displayName}
                        </span>
                        {hasUnread && <CloudUnreadBadge />}
                    </div>
                ) : (
                    <div className="flex items-center gap-[6px]">
                        <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                            {t('cloudSessionSheet.setupProfile')}
                        </span>
                    </div>
                )}
                {/* The caption is the design's one sentence for every state that needs a look; the
                    badge says which state. The record's own `error` is a server-side provisioning
                    trace that names internals, so it never reaches the row — the sheet logs it.
                    A live row has no second line: the cloud's recovery email is cloud management's
                    business, so the switcher neither shows the address nor asks for one. */}
                {attention && (
                    <span
                        className={cn(
                            'truncate text-left text-[13px] leading-[1.4] tracking-[-0.065px]',
                            isRestricted ? 'text-placeholder' : 'text-description'
                        )}
                    >
                        {t('cloudSessionSheet.checkInfo')}
                    </span>
                )}
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
                {state === 'provisioning' && <IconSpinner className="size-5 animate-spin text-point-blue" />}
                {badge && <CloudStatusBadge variant={badge.variant} label={t(`cloudSessionSheet.${badge.key}`)} />}
                {/* Selection mark — trailing filled lime check disc (Figma 3477-23611). `text-primary`
                    IS the lime: --primary resolves to hsl(76 87% 49%) === #b0ea10 (Figma main1_Color). */}
                {isSelected ? (
                    <IconCheckCircleSolid size={28} className="text-primary" />
                ) : (
                    !enterable && <IconChevronRight className="size-[18px] text-description" />
                )}
            </span>
        </button>
    );
};
