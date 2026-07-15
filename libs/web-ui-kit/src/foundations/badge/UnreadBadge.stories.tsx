import type { Meta, StoryObj } from '@storybook/react';

import { UnreadBadge } from '@chatic/web-ui-kit';

const meta: Meta<typeof UnreadBadge> = {
    title: 'web-ui-kit/foundations/UnreadBadge',
    component: UnreadBadge,
    args: { count: 3 },
};
export default meta;

type Story = StoryObj<typeof UnreadBadge>;

export const Few: Story = {};
export const Clamped: Story = { args: { count: 1200 } };
