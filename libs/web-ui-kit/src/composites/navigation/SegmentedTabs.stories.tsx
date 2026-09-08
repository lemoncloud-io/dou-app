import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SegmentedTabs } from './SegmentedTabs';

const meta: Meta<typeof SegmentedTabs> = {
    title: 'Composites/Navigation/SegmentedTabs',
    component: SegmentedTabs,
};
export default meta;

type Story = StoryObj<typeof SegmentedTabs>;

/** The invite page's two tabs — the shape this component was built for. */
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

/** Tabs divide the row equally, so a third one narrows the others rather than overflowing. */
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
