import type { Meta, StoryObj } from '@storybook/react';

import { SubscriptionButton } from '@chatic/web-ui-kit';

const meta: Meta<typeof SubscriptionButton> = {
    title: 'web-ui-kit/foundations/SubscriptionButton',
    component: SubscriptionButton,
    args: { onClick: () => undefined },
};
export default meta;

type Story = StoryObj<typeof SubscriptionButton>;

export const Free: Story = { args: { tier: 'free' } };
export const Pro: Story = { args: { tier: 'pro' } };
