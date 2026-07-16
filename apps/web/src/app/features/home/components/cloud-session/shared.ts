import type { CloudView } from '@lemoncloud/chatic-backend-api';

// Shared styles for cloud/invite list rows.
export const SELECTED_HIGHLIGHT = 'bg-[#F3F0FF] dark:bg-[#2D2640]';
export const CLOUD_AVATAR_CLASS =
    'flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full border border-[#F4F5F5] bg-[rgba(0,43,126,0.04)] dark:border-[#3A3A3E] dark:bg-[rgba(255,255,255,0.06)]';

export type CloudTab = 'my' | 'invited';

/** A cloud still being provisioned (not yet selectable). */
export const isProvisioning = (status?: CloudView['status']): boolean => status === 'reserved' || status === 'init';

export const getCloudDisplayName = (cloud: CloudView): string => cloud.name ?? cloud.email?.split('@')[0] ?? '';
