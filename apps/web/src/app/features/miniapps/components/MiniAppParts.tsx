import { useTranslation } from 'react-i18next';

import type { DomainMiniApp } from '@chatic/runtime-react';
import { cn } from '@chatic/ui-kit';

export const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
};

const TINTS = [
    'bg-[#E9F6CC] text-[#3E5A00]',
    'bg-[#E3EAFD] text-[#2343B5]',
    'bg-[#FDEBD8] text-[#8A4A00]',
    'bg-[#EFE5FC] text-[#5A2BA0]',
];

const tintOf = (id: string): string => {
    let sum = 0;
    for (const char of id) sum = (sum + (char.codePointAt(0) ?? 0)) % TINTS.length;
    return TINTS[sum];
};

export const MiniAppTile = ({ app }: { app: Pick<DomainMiniApp, 'id' | 'name'> }) => (
    <span
        aria-hidden="true"
        className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-[12px] text-[18px] font-bold',
            tintOf(app.id)
        )}
    >
        {Array.from(app.name.trim())[0] ?? ''}
    </span>
);

export const MiniAppStatusChip = ({ status }: { status: DomainMiniApp['status'] }) => {
    const { t } = useTranslation();
    if (status === 'active') return null;
    return (
        <span
            className={cn(
                'inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-medium',
                status === 'held' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
            )}
        >
            {t(status === 'held' ? 'miniApps.chip.held' : 'miniApps.chip.inactive')}
        </span>
    );
};
