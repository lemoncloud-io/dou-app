import type { Meta, StoryObj } from '@storybook/react';

import { ImageAvatar } from '@chatic/web-ui-kit';

const meta: Meta<typeof ImageAvatar> = {
    title: 'web-ui-kit/foundations/ImageAvatar',
    component: ImageAvatar,
    args: {
        // A deliberately non-square source to show the crop-to-circle behavior.
        src: 'https://picsum.photos/400/240',
        alt: 'sample',
    },
};
export default meta;

type Story = StoryObj<typeof ImageAvatar>;

export const PlaceOrChannelRow: Story = { args: { size: 46 } };
export const Small: Story = { args: { size: 28 } };
