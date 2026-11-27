const { join } = require('path');
const { mobileColors, radius } = require('../design-system/tokens/mobile/src/tailwind.cjs');

module.exports = {
    darkMode: ['class'],
    content: [
        join(__dirname, 'src/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        join(__dirname, 'src/**/*.stories.{ts,tsx}'),
        join(__dirname, '../design-system/assets/src/**/*!(*.stories|*.spec|*.test).{ts,tsx}'),
        join(__dirname, '../design-system/components/mobile/src/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        join(__dirname, '../design-system/components/mobile/src/**/*.stories.{ts,tsx}'),
        join(__dirname, '../design-system/patterns/mobile/src/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        join(__dirname, '../design-system/patterns/mobile/src/**/*.stories.{ts,tsx}'),
        join(__dirname, '../design-system/chat/mobile/src/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        join(__dirname, '../design-system/chat/mobile/src/**/*.stories.{ts,tsx}'),
    ],
    theme: {
        extend: {
            colors: mobileColors,
            borderRadius: radius,
            spacing: {
                'safe-top': 'var(--safe-top, 0px)',
                'safe-bottom': 'var(--safe-bottom, 0px)',
                'safe-left': 'var(--safe-left, 0px)',
                'safe-right': 'var(--safe-right, 0px)',
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
};
