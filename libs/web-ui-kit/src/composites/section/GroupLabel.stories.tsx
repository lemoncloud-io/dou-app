import type { Meta, StoryObj } from '@storybook/react';

import { GroupLabel } from '@chatic/web-ui-kit';

const meta: Meta<typeof GroupLabel> = {
    title: 'web-ui-kit/composites/GroupLabel',
    component: GroupLabel,
    args: { label: '대화방 설정' },
};
export default meta;

type Story = StoryObj<typeof GroupLabel>;

export const Default: Story = {};
