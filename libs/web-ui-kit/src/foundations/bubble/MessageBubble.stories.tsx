import type { Meta, StoryObj } from '@storybook/react';

import { MessageBubble } from '@chatic/web-ui-kit';

const meta: Meta<typeof MessageBubble> = {
    title: 'web-ui-kit/foundations/MessageBubble',
    component: MessageBubble,
    args: { children: 'Lorem ipsum dolor sit amet' },
    decorators: [
        Story => (
            <div className="w-[300px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof MessageBubble>;

export const Other: Story = { args: { variant: 'other' } };
export const Mine: Story = { args: { variant: 'mine' } };
export const Expandable: Story = {
    args: {
        variant: 'mine',
        children: 'Lorem ipsum dolor sit amet consectetur. '.repeat(6),
        onExpand: () => undefined,
    },
};
