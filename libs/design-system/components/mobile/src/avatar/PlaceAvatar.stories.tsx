import type { Meta, StoryObj } from '@storybook/react';

import { PlaceAvatar } from './index';

const meta: Meta<typeof PlaceAvatar> = {
    title: 'web-ui-kit/foundations/PlaceAvatar',
    component: PlaceAvatar,
};
export default meta;

type Story = StoryObj<typeof PlaceAvatar>;

export const Large: Story = { args: { name: 'Place Name', size: 'lg' } };
export const Medium: Story = { args: { name: 'Place Name', size: 'md' } };
export const Small: Story = { args: { name: 'Place Name', size: 'sm' } };

export const HomeGlyphFallback: Story = { args: { size: 'lg' } };
