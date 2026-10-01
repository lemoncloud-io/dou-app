import type { Meta, StoryObj } from '@storybook/react';

import { MessageMediaTiles, type MessageMediaTileItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof MessageMediaTiles> = {
    title: 'web-ui-kit/composites/MessageMediaTiles',
    component: MessageMediaTiles,
};
export default meta;

type Story = StoryObj<typeof MessageMediaTiles>;

const photo = (i: number) => `https://picsum.photos/seed/dou-${i}/480/480`;
const tiles = (count: number, state: MessageMediaTileItem['state'] = 'ready'): MessageMediaTileItem[] =>
    Array.from({ length: count }, (_, i) => ({ key: `k${i}`, kind: 'image', preview: photo(i), state }));
const clip = (i: number, state: MessageMediaTileItem['state'] = 'ready', poster = true): MessageMediaTileItem => ({
    key: `v${i}`,
    kind: 'video',
    preview: poster ? photo(100 + i) : undefined,
    state,
});

export const One: Story = { args: { items: tiles(1), onOpen: () => undefined } };
export const Three: Story = { args: { items: tiles(3), onOpen: () => undefined } };
export const Seven: Story = { args: { items: tiles(7), onOpen: () => undefined } };
export const Sending: Story = { args: { items: tiles(2, 'sending') } };
export const Failed: Story = { args: { items: tiles(2, 'failed') } };
export const Broken: Story = {
    args: {
        items: [
            { key: 'a', kind: 'image', preview: photo(1), state: 'ready' },
            { key: 'b', kind: 'image', state: 'broken' },
        ],
    },
};

export const OneVideo: Story = { args: { items: [clip(1)], onOpen: () => undefined } };
/** A browser-picked video travels without a poster: the grey panel, still marked as a video. */
export const VideoWithoutPoster: Story = { args: { items: [clip(1, 'ready', false)], onOpen: () => undefined } };
/** Photos and videos in the order they were sent, past the four visible tiles. */
export const Mixed: Story = {
    args: {
        items: [tiles(1)[0], clip(1), tiles(3)[2], clip(2, 'ready', false), clip(3), tiles(6)[5]],
        onOpen: () => undefined,
    },
};
/** A shell video still being prepared has no poster yet — the grey panel under the spinner. */
export const VideoSending: Story = { args: { items: [clip(1, 'sending', false), clip(2, 'sending')] } };
export const VideoFailed: Story = { args: { items: [clip(1, 'failed'), clip(2, 'failed', false)] } };
export const VideoBroken: Story = { args: { items: [clip(1), { ...clip(2), state: 'broken' }] } };
