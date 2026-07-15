import type { Meta, StoryObj } from '@storybook/react';

import { Divider } from '@chatic/web-ui-kit';

const meta: Meta<typeof Divider> = {
    title: 'web-ui-kit/foundations/Divider',
    component: Divider,
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof Divider>;

export const Line: Story = { args: { variant: 'line' } };
export const Block: Story = { args: { variant: 'block' } };
