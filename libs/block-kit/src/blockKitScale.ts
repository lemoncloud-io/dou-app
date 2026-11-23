import { createContext, useContext } from 'react';

export type BlockKitScale = 'phone' | 'desktop';

export interface BlockKitScaleClasses {
    heading: readonly [string, string, string, string];
    body: string;
    fieldLabel: string;
    context: string;
    fence: string;
    toggle: string;
    badge: string;
}

export const BLOCK_KIT_SCALE: Record<BlockKitScale, BlockKitScaleClasses> = {
    phone: {
        heading: [
            'text-[1rem] leading-6 tracking-[-0.003em] font-semibold',
            'text-[1rem] leading-6 tracking-[-0.003em] font-semibold',
            'text-[0.9375rem] leading-[1.375rem] tracking-[-0.002em] font-semibold',
            'text-[0.9375rem] leading-[1.375rem] tracking-[-0.002em] font-semibold',
        ],
        body: 'text-[0.875rem] leading-5 tracking-normal',
        fieldLabel: 'text-xs',
        context: 'text-[0.875rem] leading-5 tracking-normal',
        fence: 'text-[0.8125rem] leading-normal',
        toggle: 'text-[0.8125rem]',
        badge: 'text-[0.75rem] leading-[normal]',
    },
    desktop: {
        heading: [
            'text-[1.125rem] leading-normal tracking-normal font-semibold',
            'text-[1.125rem] leading-normal tracking-normal font-semibold',
            'text-[1rem] leading-normal tracking-normal font-semibold',
            'text-[1rem] leading-normal tracking-normal font-semibold',
        ],
        body: 'text-[1rem] leading-normal tracking-normal',
        fieldLabel: 'text-[0.8125rem]',
        context: 'text-[0.875rem] leading-normal tracking-normal',
        fence: 'text-[0.875rem] leading-normal tracking-normal',
        toggle: 'text-[0.875rem]',
        badge: 'text-[0.75rem] leading-[normal]',
    },
};

export const BlockKitScaleContext = createContext<BlockKitScaleClasses>(BLOCK_KIT_SCALE.phone);

export const useBlockKitScale = (): BlockKitScaleClasses => useContext(BlockKitScaleContext);
