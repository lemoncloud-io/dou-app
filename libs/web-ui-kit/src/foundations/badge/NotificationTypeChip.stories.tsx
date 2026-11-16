import type { Meta, StoryObj } from '@storybook/react';

import { NotificationTypeChip } from './NotificationTypeChip';

const meta: Meta<typeof NotificationTypeChip> = {
    title: 'web-ui-kit/foundations/NotificationTypeChip',
    component: NotificationTypeChip,
};
export default meta;

type Story = StoryObj<typeof NotificationTypeChip>;

export const Both: Story = {
    render: () => (
        <div className="flex gap-2">
            <NotificationTypeChip variant="mention" label="멘션" />
            <NotificationTypeChip variant="thread" label="스레드" />
        </div>
    ),
};
