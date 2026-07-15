import type { Meta, StoryObj } from '@storybook/react';

import { TextLink } from '@chatic/web-ui-kit';

const meta: Meta<typeof TextLink> = {
    title: 'web-ui-kit/foundations/TextLink',
    component: TextLink,
    args: { children: '다음에 하기' },
};
export default meta;

type Story = StoryObj<typeof TextLink>;

export const Default: Story = {};
export const WithChevron: Story = { args: { withChevron: true, children: '자세히 보기' } };
