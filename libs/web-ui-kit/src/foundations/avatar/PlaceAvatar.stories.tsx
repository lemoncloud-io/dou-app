import type { Meta, StoryObj } from '@storybook/react';

import { PlaceAvatar } from '@chatic/web-ui-kit';

const meta: Meta<typeof PlaceAvatar> = {
    title: 'web-ui-kit/foundations/PlaceAvatar',
    component: PlaceAvatar,
};
export default meta;

type Story = StoryObj<typeof PlaceAvatar>;

export const Large: Story = { args: { size: 'lg' } };
export const Medium: Story = { args: { size: 'md' } };
export const Small: Story = { args: { size: 'sm' } };
