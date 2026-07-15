import type { Meta, StoryObj } from '@storybook/react';

import { SystemNotice } from '@chatic/web-ui-kit';

const meta: Meta<typeof SystemNotice> = {
    title: 'web-ui-kit/composites/SystemNotice',
    component: SystemNotice,
};
export default meta;

type Story = StoryObj<typeof SystemNotice>;

export const Join: Story = {
    render: () => (
        <SystemNotice>
            <b className="font-semibold">레몬</b>님이 채팅방에 입장했습니다.
        </SystemNotice>
    ),
};

export const Leave: Story = {
    render: () => (
        <SystemNotice>
            <b className="font-semibold">레몬</b>님이 채팅방을 나갔습니다.
        </SystemNotice>
    ),
};
