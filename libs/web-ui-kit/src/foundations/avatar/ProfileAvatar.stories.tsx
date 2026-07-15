import type { Meta, StoryObj } from '@storybook/react';

import { ProfileAvatar } from '@chatic/web-ui-kit';

const AVATAR =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="86" height="86"><rect width="86" height="86" fill="%2390c304"/></svg>'
    );

const meta: Meta<typeof ProfileAvatar> = {
    title: 'web-ui-kit/foundations/ProfileAvatar',
    component: ProfileAvatar,
    args: { onSelect: () => undefined },
};
export default meta;

type Story = StoryObj<typeof ProfileAvatar>;

export const Placeholder: Story = {};
export const WithImage: Story = { args: { src: AVATAR } };
export const ReadOnly: Story = { args: { src: AVATAR, onSelect: undefined } };
