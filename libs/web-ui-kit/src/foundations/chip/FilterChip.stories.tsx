import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { FilterChip } from './FilterChip';

const meta: Meta<typeof FilterChip> = {
    title: 'web-ui-kit/foundations/FilterChip',
    component: FilterChip,
};
export default meta;

type Story = StoryObj<typeof FilterChip>;

const Toggle = () => {
    const [on, setOn] = useState(false);
    return <FilterChip label="안 읽은 알림만" check selected={on} onClick={() => setOn(v => !v)} />;
};

/** The notification screen's "unread only" toggle — tap to switch. */
export const UnreadOnly: Story = { render: () => <Toggle /> };

/** The quick-select row of selection mode. */
export const QuickSelect: Story = {
    render: () => (
        <div className="flex gap-1.5">
            <FilterChip label="전체 선택" />
            <FilterChip label="안 읽은 메시지" selected />
            <FilterChip label="읽은 메시지만" />
        </div>
    ),
};

/** The find-me sheet's tabs, with counts. */
export const SheetTabs: Story = {
    render: () => (
        <div className="flex gap-1.5">
            <FilterChip label="전체" count={6} selected />
            <FilterChip label="멘션" count={2} />
            <FilterChip label="스레드" count={3} />
        </div>
    ),
};
