import type { Meta, StoryObj } from '@storybook/react';

import { BrandMark } from '@chatic/web-ui-kit';

const meta: Meta<typeof BrandMark> = {
    title: 'web-ui-kit/foundations/BrandMark',
    component: BrandMark,
};
export default meta;

type Story = StoryObj<typeof BrandMark>;

export const AppHeaderSize: Story = { args: { height: 38 } };
export const InviteHeaderSize: Story = { args: { height: 40 } };

/** Same mark on a dark surface — the wordmark turns lime. */
export const OnDarkSurface: Story = {
    render: args => (
        <div className="dark bg-background p-6">
            <BrandMark {...args} />
        </div>
    ),
    args: { height: 38 },
};
