import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { CloudAvatar } from '../../foundations/avatar/CloudAvatar';
import { SelectableCard } from './SelectableCard';

const meta: Meta<typeof SelectableCard> = {
    title: 'web-ui-kit/composites/SelectableCard',
    component: SelectableCard,
    decorators: [
        Story => (
            <div className="w-[375px] bg-background p-4">
                <Story />
            </div>
        ),
    ],
    args: { title: 'My Cloud', checked: false },
};
export default meta;

type Story = StoryObj<typeof SelectableCard>;

/** Hollow grey ring. */
export const Unchecked: Story = {};

/** Lime ring and dot, with the lime trailing label. */
export const CheckedWithLabel: Story = { args: { checked: true, trailingLabel: 'Selected' } };

/** 42px leading avatar slot. */
export const WithLeading: Story = {
    args: { leading: <CloudAvatar name="My Cloud" />, checked: true, trailingLabel: 'Selected' },
};

/** Dimmed and not tappable. */
export const Disabled: Story = { args: { disabled: true } };

const MultiPickDemo = () => {
    const names = ['My Cloud', 'Family Cloud', 'A cloud with a name long enough to truncate'];
    const [picked, setPicked] = useState<string[]>(['My Cloud']);
    return (
        <div className="flex flex-col gap-3">
            {names.map(name => (
                <SelectableCard
                    key={name}
                    title={name}
                    leading={<CloudAvatar name={name} />}
                    checked={picked.includes(name)}
                    trailingLabel={picked.includes(name) ? 'Selected' : undefined}
                    onToggle={next => setPicked(prev => (next ? [...prev, name] : prev.filter(n => n !== name)))}
                />
            ))}
        </div>
    );
};

/** A host-owned multi-pick list: each card toggles itself. */
export const MultiPickList: Story = { render: () => <MultiPickDemo /> };
