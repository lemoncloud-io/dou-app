import { useTranslation } from 'react-i18next';

import { AlertCircle, Loader2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { CloudAvatar, IconCheckCircleSolid } from '@chatic/web-ui-kit';
import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CLOUD_AVATAR_CLASS, SELECTED_HIGHLIGHT, getCloudDisplayName, isProvisioning } from './shared';

const CloudStatusBadge = ({ status }: { status: CloudView['status'] }) => {
    const { t } = useTranslation();

    // 'active' has no badge — selection is shown by the trailing green check instead (Figma 2933-9794).
    // Only non-active states carry an informational badge.
    const configs: Partial<Record<NonNullable<CloudView['status']>, { label: string; className: string }>> = {
        reserved: { label: t('cloudSessionSheet.statusReserved'), className: 'text-label' },
        suspended: { label: t('cloudSessionSheet.statusSuspended'), className: 'text-yellow-600 dark:text-yellow-400' },
        expired: { label: t('cloudSessionSheet.statusExpired'), className: 'text-gray-400' },
        error: { label: t('cloudSessionSheet.statusError'), className: 'text-red-500' },
    };

    const config = status ? configs[status] : null;
    if (!config) return null;

    return (
        <div className="flex items-center gap-1 rounded-[5px] bg-secondary px-[6px] py-1">
            <span className={`text-[14px] font-medium leading-[1.19] ${config.className}`}>{config.label}</span>
        </div>
    );
};

interface CloudItemProps {
    cloud: CloudView;
    isSelected: boolean;
    isDisabled: boolean;
    /** presence dot: any unread across this cloud's places (last-visited snapshot). */
    hasUnread?: boolean;
    onSelectCloud: (cloudId: string) => void;
    onErrorClick: () => void;
}

/**
 * One owned-cloud row of the switcher. Renaming is NOT offered here — the Figma switcher has no
 * pencil and `/mypage/cloud-profile` is the single rename path (ADR-0034).
 */
export const CloudItem = ({
    cloud,
    isSelected,
    isDisabled,
    hasUnread,
    onSelectCloud,
    onErrorClick,
}: CloudItemProps) => {
    const { t } = useTranslation();
    const isError = cloud.status === 'error';
    const isActive = cloud.status === 'active';
    const disabled = isDisabled || isSelected || !isActive;
    const displayName = getCloudDisplayName(cloud);
    const hasName = !!displayName;

    return (
        <button
            onClick={() => {
                if (isError) {
                    onErrorClick();
                    return;
                }
                if (!disabled && cloud.id) onSelectCloud(cloud.id);
            }}
            disabled={isDisabled || !isActive}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            {/* Avatar — provisioning/error states show a glyph in the placeholder disc; the active
                cloud uses the AppHeader-style initials avatar (CloudAvatar) derived from its name. */}
            {isProvisioning(cloud.status) ? (
                <div className={CLOUD_AVATAR_CLASS}>
                    <Loader2 size={18} className="animate-spin text-[#9FA2A7]" />
                </div>
            ) : isError ? (
                <div className={CLOUD_AVATAR_CLASS}>
                    <AlertCircle size={20} className="text-red-500" />
                </div>
            ) : (
                <CloudAvatar name={displayName} size="lg" />
            )}
            <div className="flex flex-1 flex-col gap-0.5">
                {hasName ? (
                    <div className="flex items-center gap-[6px]">
                        <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                            {displayName}
                        </span>
                        {hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                        <CloudStatusBadge status={cloud.status} />
                    </div>
                ) : (
                    <div className="flex items-center gap-[6px]">
                        <AlertCircle size={18} className="text-white" />
                        <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                            {t('cloudSessionSheet.setupProfile')}
                        </span>
                    </div>
                )}
                <span className="truncate text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-description">
                    {cloud.email ?? ''}
                </span>
                {isProvisioning(cloud.status) && (
                    <span className="text-left text-[12px] leading-[1.3] text-[#9FA2A7]">
                        {t('cloudSessionSheet.statusReservedDescription')}
                    </span>
                )}
                {isError && cloud.error && (
                    <span className="text-left text-[11px] leading-[1.3] text-red-400">{cloud.error}</span>
                )}
            </div>
            {/* Selection mark — trailing filled lime check disc (Figma 3477-23611). `text-primary`
                IS the lime: --primary resolves to hsl(76 87% 49%) === #b0ea10 (Figma main1_Color). */}
            {isSelected && <IconCheckCircleSolid size={28} className="shrink-0 text-primary" />}
        </button>
    );
};
