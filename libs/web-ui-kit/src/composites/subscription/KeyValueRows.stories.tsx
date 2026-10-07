import type { Meta, StoryObj } from '@storybook/react';

import { KeyValueRows } from './KeyValueRows';

const meta: Meta<typeof KeyValueRows> = {
    title: 'web-ui-kit/composites/KeyValueRows',
    component: KeyValueRows,
    decorators: [
        Story => (
            <div className="w-[375px] bg-background p-4">
                <Story />
            </div>
        ),
    ],
    args: {
        rows: [
            { label: 'Plan', value: 'DoU Pro' },
            { label: 'Price', value: '₩6,600 / month', tone: 'accent', hint: '₩8,800' },
            { label: 'Next payment', value: 'Oct 30, 2026', tone: 'info' },
            { label: 'Status', value: 'Ending soon', tone: 'warning' },
            { label: 'Last payment', value: 'Failed', tone: 'danger' },
        ],
    },
};
export default meta;

type Story = StoryObj<typeof KeyValueRows>;

/** Card shell, every tone. */
export const AllTones: Story = {};

/** No shell — the shape used inside ProductCard's children. */
export const Bare: Story = { args: { bare: true } };

/** The narrowest column the app supports — long labels and values wrap instead of overflowing. */
export const Narrow320: Story = {
    decorators: [
        Story => (
            <div className="w-[320px] bg-background p-4">
                <Story />
            </div>
        ),
    ],
    args: {
        rows: [
            { label: 'Clouds kept after downgrade', value: 'My Cloud, Family Cloud, Work Cloud' },
            { label: '다음 결제 예정일', value: '2026년 10월 30일 (목)', hint: '₩8,800' },
        ],
    },
};
