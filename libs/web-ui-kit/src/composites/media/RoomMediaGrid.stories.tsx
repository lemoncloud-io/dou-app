import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { RoomMediaGrid, type RoomMediaGridItem } from './RoomMediaGrid';

const swatch = (hue: number) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue} 55% 62%)"/></svg>`
    )}`;

const items: RoomMediaGridItem[] = Array.from(
    { length: 14 },
    (_, i): RoomMediaGridItem => ({
        key: `m${i}`,
        src: i === 5 ? undefined : swatch((i * 37) % 360),
        kind: i % 4 === 1 ? 'video' : 'image',
        durationSeconds: i % 4 === 1 ? 12 + i * 9 : undefined,
    })
);

const label = (index: number, kind: 'image' | 'video') => `${kind === 'video' ? '동영상' : '사진'} ${index + 1}`;

const meta: Meta<typeof RoomMediaGrid> = {
    title: 'web-ui-kit/composites/RoomMediaGrid',
    component: RoomMediaGrid,
    args: { items, onOpen: () => undefined, onLongPress: () => undefined, tileLabel: label },
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof RoomMediaGrid>;

export const Default: Story = {};

export const Selecting: Story = {
    args: { selection: { selectedKeys: new Set(['m0', 'm5']), onToggle: () => undefined } },
};

export const Interactive: Story = {
    render: function Render(args) {
        const [selected, setSelected] = useState<Set<string> | null>(null);
        const toggle = (key: string) =>
            setSelected(current => {
                const next = new Set(current ?? []);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            });
        return (
            <RoomMediaGrid
                {...args}
                onLongPress={key => setSelected(new Set([key]))}
                selection={selected ? { selectedKeys: selected, onToggle: toggle } : undefined}
            />
        );
    },
};
