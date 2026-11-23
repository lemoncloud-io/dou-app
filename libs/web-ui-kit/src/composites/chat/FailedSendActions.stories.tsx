import type { Meta, StoryObj } from '@storybook/react';

import { AudioMessageBubble, FailedSendActions } from '../../index';

const meta: Meta<typeof FailedSendActions> = {
    title: 'web-ui-kit/composites/FailedSendActions',
    component: FailedSendActions,
    args: { retryLabel: '재전송', deleteLabel: '삭제', onRetry: () => undefined, onDelete: () => undefined },
};
export default meta;

type Story = StoryObj<typeof FailedSendActions>;

export const Default: Story = {};
export const EnglishDefaults: Story = { args: { retryLabel: undefined, deleteLabel: undefined } };

export const UnderFailedBubble: Story = {
    render: args => (
        <div className="flex w-[343px] flex-col items-end gap-1.5">
            <AudioMessageBubble side="mine" state="failed" name="새로운 녹음 8.m4a" failedText="전송하지 못했습니다" />
            <FailedSendActions {...args} />
        </div>
    ),
};
