import type { Meta, StoryObj } from '@storybook/react';

import { IconChevronRight, IconEdit } from '@chatic/design-system-assets/icons';
import { ListRow } from './index';
import { ProfileAvatar, StatusBadge } from '@chatic/design-system-components-mobile';

const AVATAR =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="%23102346"/></svg>'
    );

const meta: Meta<typeof ListRow> = {
    title: 'web-ui-kit/composites/ListRow',
    component: ListRow,
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof ListRow>;

export const Profile: Story = {
    args: {
        leading: <ProfileAvatar src={AVATAR} size={36} />,
        title: '<친구 이름>',
        trailing: <IconChevronRight className="size-[18px] text-description" />,
        onClick: () => undefined,
    },
};

export const Member: Story = {
    args: {
        leading: <ProfileAvatar src={AVATAR} size={36} />,
        title: (
            <>
                <StatusBadge label="방장" variant="owner" />
                <span>&lt;소유자 이름&gt;</span>
            </>
        ),
    },
};

export const ToggleRow: Story = {
    args: {
        title: '대화방 알림',
        trailing: <span className="h-6 w-11 rounded-full bg-muted" />,
    },
};

export const Destructive: Story = {
    args: { title: '방 삭제', destructive: true, onClick: () => undefined },
};

export const WithSubtitleIcon: Story = {
    args: {
        leading: <ProfileAvatar src={AVATAR} size={36} />,
        title: '<채팅방 이름>',
        subtitleIcon: <IconEdit size={14} role="img" aria-label="초안" aria-hidden={false} />,
        subtitle: '내일 회의 자료는 오늘 저녁까지 올릴게요',
        onClick: () => undefined,
    },
};
