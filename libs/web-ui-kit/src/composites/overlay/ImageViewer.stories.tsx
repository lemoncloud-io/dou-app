import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { ImageViewer } from '@chatic/web-ui-kit';

const meta: Meta<typeof ImageViewer> = {
    title: 'web-ui-kit/composites/ImageViewer',
    component: ImageViewer,
};
export default meta;

type Story = StoryObj<typeof ImageViewer>;

const photo = (i: number) => `https://picsum.photos/seed/dou-viewer-${i}/1200/1600`;

const Demo = ({ count }: { count: number }) => {
    const images = Array.from({ length: count }, (_, i) => photo(i));
    const [index, setIndex] = useState<number | null>(0);
    return (
        <>
            <button onClick={() => setIndex(0)} className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold">
                Open viewer
            </button>
            <ImageViewer
                images={images}
                index={index}
                onIndexChange={setIndex}
                onClose={() => setIndex(null)}
                title="사진"
                closeLabel="닫기"
                previousLabel="이전 사진"
                nextLabel="다음 사진"
            />
        </>
    );
};

export const Single: Story = { render: () => <Demo count={1} /> };
export const Several: Story = { render: () => <Demo count={4} /> };
