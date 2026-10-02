import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Download, Share } from 'lucide-react';

import { MediaViewer, MediaViewerActionButton, type MediaViewerItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof MediaViewer> = {
    title: 'web-ui-kit/composites/MediaViewer',
    component: MediaViewer,
};
export default meta;

type Story = StoryObj<typeof MediaViewer>;

const photoSrc = (i: number) => `https://picsum.photos/seed/dou-viewer-${i}/1200/1600`;
// The same picture at tile size, standing in while the full one loads.
const thumbSrc = (i: number) => `https://picsum.photos/seed/dou-viewer-${i}/60/80`;

const photo = (i: number, withPreview: boolean): MediaViewerItem => ({
    key: `photo-${i}`,
    kind: 'image',
    src: photoSrc(i),
    preview: withPreview ? thumbSrc(i) : undefined,
    state: 'ready',
});

// A short public sample clip, with a poster frame drawn from the photo seed.
const video = (i: number): MediaViewerItem => ({
    key: `video-${i}`,
    kind: 'video',
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    preview: `https://picsum.photos/seed/dou-viewer-video-${i}/1200/800`,
    state: 'ready',
});

const labels = { title: '사진', close: '닫기', previous: '이전', next: '다음', play: '재생' };

const Demo = ({ items, withActions = false }: { items: MediaViewerItem[]; withActions?: boolean }) => {
    const [index, setIndex] = useState<number | null>(0);
    // Opened from the button below — a tap, so the browser lets the first video start on its own.
    const [autoPlay, setAutoPlay] = useState(false);
    return (
        <>
            <button
                onClick={() => {
                    setAutoPlay(true);
                    setIndex(0);
                }}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open viewer
            </button>
            <MediaViewer
                items={items}
                index={index}
                onIndexChange={setIndex}
                onClose={() => setIndex(null)}
                autoPlay={autoPlay}
                labels={labels}
                renderFooter={
                    withActions
                        ? () => (
                              <>
                                  <MediaViewerActionButton label="공유" onClick={() => undefined} disabled>
                                      <Share className="size-5" />
                                  </MediaViewerActionButton>
                                  <MediaViewerActionButton label="저장" onClick={() => undefined} busy progress={0.6}>
                                      <Download className="size-5" />
                                  </MediaViewerActionButton>
                              </>
                          )
                        : undefined
                }
            />
        </>
    );
};

const photos = (count: number, withPreview = false) => Array.from({ length: count }, (_, i) => photo(i, withPreview));

export const Single: Story = { render: () => <Demo items={photos(1)} /> };
export const Several: Story = { render: () => <Demo items={photos(4)} /> };
/** Throttle the network to see the small copy stand in until the original arrives. */
export const WithPlaceholders: Story = { render: () => <Demo items={photos(3, true)} /> };
/** The host's buttons in the bottom bar — a share waiting while a save is in progress. */
export const WithActions: Story = { render: () => <Demo items={photos(2)} withActions /> };
/**
 * Photos and videos in one message, with a broken one counted among them. The video sits between the
 * bars with the browser's own controls; a drag on its seek bar scrubs rather than pages.
 */
export const PhotosAndVideos: Story = {
    render: () => (
        <Demo
            items={[
                video(0),
                photo(1, true),
                { key: 'broken-2', kind: 'image', state: 'broken' },
                video(3),
                photo(4, true),
            ]}
            withActions
        />
    ),
};
