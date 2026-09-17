import { createElement } from 'react';

import type { Preview } from '@storybook/react';

import './preview.css';

/**
 * The widths this kit is drawn for, smallest first. A story frame is one of these, never an
 * arbitrary number: the kit ships into a phone-shaped app whose column fills the device up to the
 * phone-class upper bound, so "does this hold together" is only a meaningful question at a width
 * some real device actually has.
 *
 * `base` stays the default so existing stories frame exactly as they did before these presets
 * existed. `fold-open` is the one width where a surface is wider than any phone, and it is the
 * reason the others are listed at all — a layout that only ever renders at 390 hides both ends.
 */
const VIEWPORTS = {
    xs: { title: 'xs · 320 (iPhone SE 1)', width: 320 },
    'fold-cover': { title: 'fold-cover · 344 (Z Fold cover)', width: 344 },
    sm: { title: 'sm · 360 (common Android)', width: 360 },
    base: { title: 'base · 390 (iPhone 14/15)', width: 390 },
    'fold-open': { title: 'fold-open · 690 (Z Fold unfolded)', width: 690 },
} as const;

type ViewportName = keyof typeof VIEWPORTS;

/**
 * A theme toolbar toggles the `.dark` class on <html> so every story renders in
 * the selected light/dark token set. A viewport toolbar picks the frame width.
 */
const preview: Preview = {
    parameters: {
        layout: 'centered',
        controls: { expanded: true },
    },
    globalTypes: {
        theme: {
            description: 'Light / dark tokens',
            defaultValue: 'light',
            toolbar: {
                title: 'Theme',
                icon: 'circlehollow',
                items: [
                    { value: 'light', title: 'Light' },
                    { value: 'dark', title: 'Dark' },
                ],
                dynamicTitle: true,
            },
        },
        viewport: {
            description: 'Frame width',
            defaultValue: 'base',
            toolbar: {
                title: 'Viewport',
                icon: 'mobile',
                items: Object.entries(VIEWPORTS).map(([value, { title }]) => ({ value, title })),
                dynamicTitle: true,
            },
        },
    },
    decorators: [
        (Story, context) => {
            const dark = context.globals.theme === 'dark';
            if (typeof document !== 'undefined') {
                document.documentElement.classList.toggle('dark', dark);
            }
            const viewport =
                (context.globals.viewport as ViewportName) in VIEWPORTS
                    ? (context.globals.viewport as ViewportName)
                    : 'base';
            return createElement(
                'div',
                { style: { width: VIEWPORTS[viewport].width, maxWidth: '100%' } },
                createElement(Story)
            );
        },
    ],
};

export default preview;
