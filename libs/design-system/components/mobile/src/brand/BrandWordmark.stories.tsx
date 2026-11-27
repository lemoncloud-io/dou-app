import type { Meta, StoryObj } from '@storybook/react';

import { BrandWordmark } from './index';

const meta: Meta<typeof BrandWordmark> = {
    title: 'web-ui-kit/foundations/BrandWordmark',
    component: BrandWordmark,
};
export default meta;

type Story = StoryObj<typeof BrandWordmark>;

export const LoginScreenSize: Story = { args: { height: 32 } };

export const OnDarkSurface: Story = {
    render: args => (
        <div className="dark bg-background p-6">
            <BrandWordmark {...args} />
        </div>
    ),
    args: { height: 32 },
};
