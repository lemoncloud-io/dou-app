import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SelectedAvatarRow, type SelectedAvatarItem } from './SelectedAvatarRow';

const meta: Meta<typeof SelectedAvatarRow> = {
    title: 'web-ui-kit/composites/SelectedAvatarRow',
    component: SelectedAvatarRow,
    decorators: [
        Story => (
            <div className="w-[375px] bg-secondary">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof SelectedAvatarRow>;

const ALL: SelectedAvatarItem[] = [
    { id: 'a', name: 'Kim' },
    { id: 'b', name: 'Lee' },
    { id: 'c', name: 'Park' },
    { id: 'd', name: '가나다마라아아' },
];

/** Toggle friends in and out to see the pop-in / fade-out transitions. */
const InteractiveDemo = () => {
    const [selectedIds, setSelectedIds] = useState<string[]>(['a', 'b']);
    const items = ALL.filter(item => selectedIds.includes(item.id));

    return (
        <div className="flex flex-col gap-3 p-4">
            <div className="flex gap-2">
                {ALL.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        className="rounded-full border px-3 py-1 text-sm"
                        onClick={() =>
                            setSelectedIds(prev =>
                                prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                            )
                        }
                    >
                        {item.name}
                    </button>
                ))}
            </div>
            <SelectedAvatarRow
                items={items}
                onRemove={id => setSelectedIds(prev => prev.filter(existing => existing !== id))}
                removeLabel="Remove"
            />
        </div>
    );
};

export const Interactive: Story = { render: () => <InteractiveDemo /> };
export const TwoSelected: Story = { args: { items: ALL.slice(0, 2), removeLabel: 'Remove' } };
export const Empty: Story = { args: { items: [], removeLabel: 'Remove' } };
