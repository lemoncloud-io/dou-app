import { useTranslation } from 'react-i18next';

import type { DomainMiniApp } from '@chatic/runtime';
import { cn } from '@chatic/ui-kit';

/** The address's host, as the rows show it under the name; the address itself when it is not a URL. */
export const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
};

// Four tints, picked by the mini app's id so a row keeps its colour wherever it is listed.
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

/** A 44px rounded tile with the name's first character — mini apps have no icon of their own yet. */
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

/** "Off" or "On hold" before the name of a mini app that is not active; nothing for an active one. */
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
