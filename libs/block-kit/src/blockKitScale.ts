import { createContext, useContext } from 'react';

/**
 * Which of the design's two card sizes to draw. The design sets a webhook card twice: once for
 * the phone, and once a step larger for the desktop message column, which is wider and read from
 * further away. `phone` is what apps/web draws; `desktop` is desktop-web's.
 */
export type BlockKitScale = 'phone' | 'desktop';

export interface BlockKitScaleClasses {
    /** One per heading level, h1 to h4. */
    heading: readonly [string, string, string, string];
    /** Section text and a field's value. */
    body: string;
    /** The small caption over a field's value. */
    fieldLabel: string;
    /** A context line. */
    context: string;
    /** A fenced run — in a card, almost always a stack trace. */
    fence: string;
    /** The fold toggle under a long fenced run. */
    toggle: string;
}

/**
 * Sizes written out rather than read from the app's type tokens. The three callers name their
 * tokens alike and size them differently — `text-body` is 16px in apps/web and 15px in desktop-web
 * and the builder — so a token here would draw a different card in each, and the builder's preview
 * would not show what a channel shows. `phone` is exactly what apps/web's tokens resolved to when
 * the card shipped, so that app draws as it did.
 */
export const BLOCK_KIT_SCALE: Record<BlockKitScale, BlockKitScaleClasses> = {
    phone: {
        // h1 is the body size made bold rather than a step up the scale: it sits under an author
        // line that already carries weight, and in a phone-width card a larger heading wraps a
        // one-line error name onto two.
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
    },
    desktop: {
        // The desktop column has room for a heading a step above the body, and the design takes it.
        heading: [
            'text-[1.125rem] leading-normal tracking-normal font-semibold',
            'text-[1.125rem] leading-normal tracking-normal font-semibold',
            'text-[1rem] leading-normal tracking-normal font-semibold',
            'text-[1rem] leading-normal tracking-normal font-semibold',
        ],
        body: 'text-[1rem] leading-normal tracking-normal',
        fieldLabel: 'text-[0.8125rem]',
        // The context line keeps the phone's size: the design draws the service chip at 14px in
        // both, so only the text a reader reads grows.
        context: 'text-[0.875rem] leading-normal tracking-normal',
        fence: 'text-[0.875rem] leading-normal tracking-normal',
        toggle: 'text-[0.875rem]',
    },
};

export const BlockKitScaleContext = createContext<BlockKitScaleClasses>(BLOCK_KIT_SCALE.phone);

export const useBlockKitScale = (): BlockKitScaleClasses => useContext(BlockKitScaleContext);
