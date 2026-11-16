import type { Meta, StoryObj } from '@storybook/react';

import { MonthGroupHeader } from './MonthGroupHeader';

const meta: Meta<typeof MonthGroupHeader> = {
    title: 'web-ui-kit/composites/MonthGroupHeader',
    component: MonthGroupHeader,
    args: { label: '2026년 11월' },
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof MonthGroupHeader>;

/** Figma 6067:22462. */
export const Default: Story = {};

/** Pinned while its month scrolls under it. */
export const Sticky: Story = {
    args: { sticky: true },
    render: args => (
        <div className="h-[200px] overflow-y-auto">
            <MonthGroupHeader {...args} />
            {Array.from({ length: 12 }, (_, i) => (
                <p key={i} className="px-4 py-3 text-[15px] text-foreground">
                    새로운 녹음 {i + 1}.m4a
                </p>
            ))}
            <MonthGroupHeader {...args} label="2026년 10월" />
            {Array.from({ length: 6 }, (_, i) => (
                <p key={i} className="px-4 py-3 text-[15px] text-foreground">
                    회의 녹음 {i + 1}.m4a
                </p>
            ))}
        </div>
    ),
};
