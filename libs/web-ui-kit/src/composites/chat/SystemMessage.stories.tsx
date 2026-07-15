import type { Meta, StoryObj } from '@storybook/react';

import { SystemMessage } from '@chatic/web-ui-kit';

const meta: Meta<typeof SystemMessage> = {
    title: 'web-ui-kit/composites/SystemMessage',
    component: SystemMessage,
    args: {
        title: '<친구>님이 채팅방에 입장했습니다.',
        description: '1:1 대화를 시작해 보세요.',
    },
};
export default meta;

type Story = StoryObj<typeof SystemMessage>;

export const Default: Story = {};
