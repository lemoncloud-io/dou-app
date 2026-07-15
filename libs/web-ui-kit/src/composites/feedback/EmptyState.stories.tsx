import type { Meta, StoryObj } from '@storybook/react';

import { EmptyState } from '@chatic/web-ui-kit';

const meta: Meta<typeof EmptyState> = {
    title: 'web-ui-kit/composites/EmptyState',
    component: EmptyState,
    args: {
        title: '친구의 응답을 기다리고 있어요',
        description: '초대를 수락하면 채팅방에서 대화를 시작할 수 있어요',
        actionLabel: '초대 다시 보내기',
        onAction: () => undefined,
    },
    decorators: [
        Story => (
            <div className="w-[358px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {};
export const WithoutAction: Story = { args: { actionLabel: undefined, onAction: undefined } };
