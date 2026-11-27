import type { Meta, StoryObj } from '@storybook/react';

import { ImageAvatar } from './index';

const meta: Meta<typeof ImageAvatar> = {
    title: 'web-ui-kit/foundations/ImageAvatar',
    component: ImageAvatar,
    args: {
        src: 'https://picsum.photos/400/240',
        alt: 'sample',
    },
};
export default meta;

type Story = StoryObj<typeof ImageAvatar>;

export const PlaceOrChannelRow: Story = { args: { size: 46 } };
export const Small: Story = { args: { size: 28 } };
