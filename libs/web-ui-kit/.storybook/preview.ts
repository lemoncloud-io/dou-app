import { createElement } from 'react';

import type { Preview } from '@storybook/react';

import './preview.css';

/**
 * A theme toolbar toggles the `.dark` class on <html> so every story renders in
 * the selected light/dark token set. Stories are wrapped in a mobile-width frame.
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
    },
    decorators: [
        (Story, context) => {
            const dark = context.globals.theme === 'dark';
            if (typeof document !== 'undefined') {
                document.documentElement.classList.toggle('dark', dark);
            }
            return createElement('div', { style: { width: 390, maxWidth: '100%' } }, createElement(Story));
        },
    ],
};

export default preview;
