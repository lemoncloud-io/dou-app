import type { Meta, StoryObj } from '@storybook/react';

import { PullToRefresh } from './PullToRefresh';

const meta: Meta<typeof PullToRefresh> = {
    title: 'web-ui-kit/composites/PullToRefresh',
    component: PullToRefresh,
    // Touch-only gesture: open the canvas in a touch-emulating viewport (device toolbar) to pull.
    decorators: [
        Story => (
            <div className="flex h-[720px] w-[390px] flex-col overflow-hidden border border-input-border">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof PullToRefresh>;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const Default: Story = {
    render: () => (
        <PullToRefresh
            onRefresh={() => wait(1500)}
            refreshingLabel="새로고침 중"
            className="min-h-0 flex-1 overflow-y-auto"
            contentClassName="flex flex-col"
        >
            {Array.from({ length: 30 }).map((_, i) => (
                <p key={i} className="px-4 py-3 text-foreground">
                    목록 항목 {i + 1}
                </p>
            ))}
        </PullToRefresh>
    ),
};
