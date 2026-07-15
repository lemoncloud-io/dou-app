import type { Meta, StoryObj } from '@storybook/react';

import { StatusBadge } from '@chatic/web-ui-kit';

const meta: Meta<typeof StatusBadge> = {
    title: 'web-ui-kit/foundations/StatusBadge',
    component: StatusBadge,
};
export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Owner: Story = { args: { label: '방장', variant: 'owner' } };
export const Pending: Story = { args: { label: '초대 대기 중', variant: 'pending' } };
export const Mine: Story = { args: { label: 'MY', variant: 'mine' } };
