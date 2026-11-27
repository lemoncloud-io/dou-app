import type { Meta, StoryObj } from '@storybook/react';

import { RoomFilesSummary, type RoomFilesSummaryItem } from './RoomFilesSummary';

const items: RoomFilesSummaryItem[] = [
    { key: 'media', label: '사진·동영상', count: 128 },
    { key: 'file', label: '파일', count: 12 },
    { key: 'audio', label: '음성', count: 3, accent: true },
    { key: 'link', label: '링크', count: 24 },
];

const meta: Meta<typeof RoomFilesSummary> = {
    title: 'web-ui-kit/composites/RoomFilesSummary',
    component: RoomFilesSummary,
    args: {
        items,
        title: '대화방 파일',
        seeAllLabel: '전체 보기',
        onSelect: () => undefined,
        onSeeAll: () => undefined,
    },
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof RoomFilesSummary>;

export const Default: Story = {};

export const Loading: Story = { args: { loading: true } };

export const Plain: Story = {
    args: { onSeeAll: undefined, items: items.map(item => ({ ...item, accent: false })) },
};
