import type { Meta, StoryObj } from '@storybook/react';

import { PlanBadge } from '@chatic/web-ui-kit';

const meta: Meta<typeof PlanBadge> = {
    title: 'web-ui-kit/foundations/PlanBadge',
    component: PlanBadge,
    args: { label: 'FREE' },
};
export default meta;

type Story = StoryObj<typeof PlanBadge>;

export const Free: Story = {};
export const Pro: Story = { args: { label: 'PRO', accent: true } };
