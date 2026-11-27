import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SegmentedTabs } from './SegmentedTabs';

const meta: Meta<typeof SegmentedTabs> = {
    title: 'Composites/Navigation/SegmentedTabs',
    component: SegmentedTabs,
};
export default meta;

type Story = StoryObj<typeof SegmentedTabs>;

const TwoTabsDemo = () => {
    const [value, setValue] = useState('place');
    return (
        <SegmentedTabs
            items={[
                { id: 'place', label: '플레이스' },
                { id: 'contact', label: '연락처' },
            ]}
            value={value}
            onChange={setValue}
        />
    );
};

const ThreeTabsDemo = () => {
    const [value, setValue] = useState('all');
    return (
        <SegmentedTabs
            items={[
                { id: 'all', label: '전체' },
                { id: 'mine', label: '내 채팅방' },
                { id: 'archived', label: '보관함' },
            ]}
            value={value}
            onChange={setValue}
        />
    );
};

export const TwoTabs: Story = { render: () => <TwoTabsDemo /> };
export const ThreeTabs: Story = { render: () => <ThreeTabsDemo /> };

const InlineCountsDemo = () => {
    const [value, setValue] = useState('all');
    return (
        <SegmentedTabs
            variant="inline"
            items={[
                { id: 'all', label: '전체', count: 12 },
                { id: 'group', label: '그룹 대화', count: 8 },
                { id: 'dm', label: '1:1 대화', count: 4 },
            ]}
            value={value}
            onChange={setValue}
            trailing={<span className="size-6 rounded-full border border-foreground" aria-label="new chat" />}
        />
    );
};

const NotificationTabsDemo = () => {
    const [value, setValue] = useState('all');
    return (
        <SegmentedTabs
            variant="inline"
            items={[
                { id: 'all', label: '전체', count: 4 },
                { id: 'group', label: '그룹 대화', count: 3 },
                { id: 'dm', label: '1:1 대화', count: 1 },
                { id: 'thread', label: '스레드', count: 1 },
                { id: 'mention', label: '멘션', count: 0 },
            ]}
            value={value}
            onChange={setValue}
        />
    );
};

export const InlineWithCounts: Story = { render: () => <InlineCountsDemo /> };
export const NotificationTabs: Story = { render: () => <NotificationTabsDemo /> };
