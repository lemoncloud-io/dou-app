import type { Meta, StoryObj } from '@storybook/react';

import { VerifiedBadge } from '@chatic/web-ui-kit';

const meta: Meta<typeof VerifiedBadge> = {
    title: 'web-ui-kit/foundations/VerifiedBadge',
    component: VerifiedBadge,
};
export default meta;

type Story = StoryObj<typeof VerifiedBadge>;

export const Default: Story = {};
export const Large: Story = { args: { size: 28 } };
