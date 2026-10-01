import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Download, Share } from 'lucide-react';

import { ImageViewer, ImageViewerActionButton } from '@chatic/web-ui-kit';

const meta: Meta<typeof ImageViewer> = {
    title: 'web-ui-kit/composites/ImageViewer',
    component: ImageViewer,
};
export default meta;

type Story = StoryObj<typeof ImageViewer>;

const photo = (i: number) => `https://picsum.photos/seed/dou-viewer-${i}/1200/1600`;
// The same picture at tile size, standing in while the full one loads.
const thumb = (i: number) => `https://picsum.photos/seed/dou-viewer-${i}/60/80`;

const Demo = ({
    count,
    withPlaceholders = false,
    withActions = false,
}: {
    count: number;
    withPlaceholders?: boolean;
    withActions?: boolean;
}) => {
    const images = Array.from({ length: count }, (_, i) => photo(i));
    const placeholders = withPlaceholders ? Array.from({ length: count }, (_, i) => thumb(i)) : undefined;
    const [index, setIndex] = useState<number | null>(0);
    return (
        <>
            <button onClick={() => setIndex(0)} className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold">
                Open viewer
            </button>
            <ImageViewer
                images={images}
                placeholders={placeholders}
                index={index}
                onIndexChange={setIndex}
                onClose={() => setIndex(null)}
                title="사진"
                closeLabel="닫기"
                previousLabel="이전 사진"
                nextLabel="다음 사진"
                renderFooter={
                    withActions
                        ? () => (
                              <>
                                  <ImageViewerActionButton label="공유" onClick={() => undefined} disabled>
                                      <Share className="size-5" />
                                  </ImageViewerActionButton>
                                  <ImageViewerActionButton label="저장" onClick={() => undefined} busy progress={0.6}>
                                      <Download className="size-5" />
                                  </ImageViewerActionButton>
                              </>
                          )
                        : undefined
                }
            />
        </>
    );
};

export const Single: Story = { render: () => <Demo count={1} /> };
export const Several: Story = { render: () => <Demo count={4} /> };
/** Throttle the network to see the small copy stand in until the original arrives. */
export const WithPlaceholders: Story = { render: () => <Demo count={3} withPlaceholders /> };
/** The host's buttons in the bottom bar — a share waiting while a save is in progress. */
export const WithActions: Story = { render: () => <Demo count={2} withActions /> };
