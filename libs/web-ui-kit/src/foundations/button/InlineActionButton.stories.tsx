import type { Meta, StoryObj } from '@storybook/react';

import { InlineActionButton } from '@chatic/web-ui-kit';

const meta: Meta<typeof InlineActionButton> = {
    title: 'web-ui-kit/foundations/InlineActionButton',
    component: InlineActionButton,
    args: { amount: '₩8,600', originalAmount: '₩10,000', label: '구독하기' },
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof InlineActionButton>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
