import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { ImageViewer } from '@chatic/web-ui-kit';

const meta: Meta<typeof ImageViewer> = {
    title: 'web-ui-kit/composites/ImageViewer',
    component: ImageViewer,
};
export default meta;

type Story = StoryObj<typeof ImageViewer>;

const Demo = () => {
    const [src, setSrc] = useState<string | null>(null);
    return (
        <>
            <button
                onClick={() => setSrc('https://picsum.photos/seed/dou-viewer/1200/1600')}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open viewer
            </button>
            <ImageViewer src={src} onClose={() => setSrc(null)} title="사진" closeLabel="닫기" />
        </>
    );
};

export const Default: Story = { render: () => <Demo /> };
