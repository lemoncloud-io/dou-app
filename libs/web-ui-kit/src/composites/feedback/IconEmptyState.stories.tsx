import type { Meta, StoryObj } from '@storybook/react';

import { IconNavBell } from '../../resources/icons';
import { IconEmptyState } from './IconEmptyState';

const meta: Meta<typeof IconEmptyState> = {
    title: 'web-ui-kit/composites/IconEmptyState',
    component: IconEmptyState,
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof IconEmptyState>;

export const NoNotifications: Story = {
    args: {
        icon: <IconNavBell size={28} />,
        title: '아직 알림이 없습니다',
        description: '이 플레이스에서 나를 멘션하거나\n내 메시지에 답글·반응이 달리면 여기에 모입니다.',
    },
};

export const WithAction: Story = {
    args: {
        icon: <IconNavBell size={28} />,
        title: '안 읽은 알림이 없습니다',
        actionLabel: '모든 알림 보기',
        onAction: () => undefined,
    },
};
