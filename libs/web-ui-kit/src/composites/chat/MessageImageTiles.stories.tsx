import type { Meta, StoryObj } from '@storybook/react';

import { MessageImageTiles, type MessageImageTileItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof MessageImageTiles> = {
    title: 'web-ui-kit/composites/MessageImageTiles',
    component: MessageImageTiles,
};
export default meta;

type Story = StoryObj<typeof MessageImageTiles>;

const photo = (i: number) => `https://picsum.photos/seed/dou-${i}/480/480`;
const tiles = (count: number, state: MessageImageTileItem['state'] = 'ready'): MessageImageTileItem[] =>
    Array.from({ length: count }, (_, i) => ({ key: `k${i}`, src: photo(i), state }));

export const One: Story = { args: { items: tiles(1), onOpen: () => undefined } };
export const Three: Story = { args: { items: tiles(3), onOpen: () => undefined } };
export const Seven: Story = { args: { items: tiles(7), onOpen: () => undefined } };
export const Sending: Story = { args: { items: tiles(2, 'sending') } };
export const Failed: Story = { args: { items: tiles(2, 'failed') } };
export const Broken: Story = {
    args: {
        items: [
            { key: 'a', src: photo(1), state: 'ready' },
            { key: 'b', state: 'broken' },
        ],
    },
};
