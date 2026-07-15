import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SelectableUserItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof SelectableUserItem> = {
    title: 'web-ui-kit/composites/SelectableUserItem',
    component: SelectableUserItem,
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof SelectableUserItem>;

const List = () => {
    const [sel, setSel] = useState<Record<string, boolean>>({ Kim: true });
    const names = ['Kim', 'Lee', 'Park'];
    return (
        <>
            {names.map(n => (
                <SelectableUserItem
                    key={n}
                    name={n}
                    checked={!!sel[n]}
                    onToggle={v => setSel(s => ({ ...s, [n]: v }))}
                />
            ))}
        </>
    );
};

export const MultiSelect: Story = { render: () => <List /> };
export const Selected: Story = { args: { name: 'Name', checked: true } };
export const Unselected: Story = { args: { name: 'Name', checked: false } };
