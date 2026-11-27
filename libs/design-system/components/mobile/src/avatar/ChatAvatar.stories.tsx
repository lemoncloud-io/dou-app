import type { Meta, StoryObj } from '@storybook/react';

import { ChatAvatar } from './index';

const meta: Meta<typeof ChatAvatar> = {
    title: 'web-ui-kit/foundations/ChatAvatar',
    component: ChatAvatar,
};
export default meta;

type Story = StoryObj<typeof ChatAvatar>;

export const Large: Story = { args: { size: 'lg' } };
export const Medium: Story = { args: { size: 'md' } };
export const Small: Story = { args: { size: 'sm' } };
