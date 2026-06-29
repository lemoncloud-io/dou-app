import { useTranslation } from 'react-i18next';

import { AlertCircle, Check, Loader2, Pencil, User } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CLOUD_AVATAR_CLASS, SELECTED_HIGHLIGHT, getCloudDisplayName, isProvisioning } from './shared';

const CloudStatusBadge = ({ status }: { status: CloudView['status'] }) => {
    const { t } = useTranslation();

    const configs: Partial<Record<NonNullable<CloudView['status']>, { label: string; className: string }>> = {
        active: { label: t('cloudSessionSheet.statusActive'), className: 'text-[#2A7EF4]' },
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
            {status === 'active' && <Check size={16} className="text-[#2A7EF4]" strokeWidth={1.5} />}
        </div>
    );
};

interface CloudItemProps {
    cloud: CloudView;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectCloud: (cloudId: string) => void;
    onErrorClick: () => void;
    onEditCloud?: (cloud: CloudView) => void;
}

export const CloudItem = ({
    cloud,
    isSelected,
    isDisabled,
    onSelectCloud,
    onErrorClick,
    onEditCloud,
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
                'flex w-full items-center gap-[5px] rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
                {isProvisioning(cloud.status) ? (
                    <Loader2 size={18} className="animate-spin text-[#9FA2A7]" />
                ) : isError ? (
                    <AlertCircle size={20} className="text-red-500" />
                ) : (
                    isSelected && <Check size={22} className="text-[#C139E3]" strokeWidth={2} />
                )}
            </div>
            <div className="flex flex-1 items-center gap-3 pr-[6px]">
                <div className={CLOUD_AVATAR_CLASS}>
                    <User size={16} className="text-placeholder" />
                </div>
                <div className="flex flex-col gap-0.5">
                    {hasName ? (
                        <div className="flex items-center gap-[6px]">
                            <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                                {displayName}
                            </span>
                            {isActive && onEditCloud && (
                                <button
                                    type="button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        onEditCloud(cloud);
                                    }}
                                    className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Pencil size={14} />
                                </button>
                            )}
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
                    <span className="text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
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
            </div>
        </button>
    );
};
