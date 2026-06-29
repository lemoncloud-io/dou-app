import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import type { CloudTab } from './shared';

interface TabBarProps {
    tab: CloudTab;
    onChange: (tab: CloudTab) => void;
    inviteCount: number;
}

export const TabBar = ({ tab, onChange, inviteCount }: TabBarProps) => {
    const { t } = useTranslation();
    return (
        <div className="relative mx-4 flex rounded-lg bg-[#F4F5F5] p-[3px] dark:bg-[#2A2A2E]">
            <div
                className="absolute bottom-[3px] top-[3px] w-[calc(50%-3px)] rounded-md bg-white shadow-sm transition-transform duration-200 ease-out dark:bg-[#3A3A3E]"
                style={{ transform: tab === 'my' ? 'translateX(3px)' : 'translateX(calc(100% + 3px))' }}
            />
            {(['my', 'invited'] as CloudTab[]).map(key => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    className={cn(
                        'relative z-10 flex-1 py-2 text-[14px] font-medium transition-colors',
                        tab === key ? 'text-foreground' : 'text-muted-foreground'
                    )}
                >
                    {key === 'my'
                        ? t('cloudSessionSheet.tabMy')
                        : `${t('cloudSessionSheet.tabInvited')}${inviteCount > 0 ? ` (${inviteCount})` : ''}`}
                </button>
            ))}
        </div>
    );
};
