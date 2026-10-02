import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AttachSourceSheet } from '@chatic/web-ui-kit';

const meta: Meta<typeof AttachSourceSheet> = {
    title: 'web-ui-kit/composites/AttachSourceSheet',
    component: AttachSourceSheet,
};
export default meta;

type Story = StoryObj<typeof AttachSourceSheet>;

const Demo = ({ notice }: { notice?: string }) => {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open file sources
            </button>
            <AttachSourceSheet
                open={open}
                onOpenChange={setOpen}
                labels={{ album: '앨범에서 선택', files: '파일에서 선택' }}
                notice={notice}
                onAlbum={() => setOpen(false)}
                onFiles={() => setOpen(false)}
            />
        </>
    );
};

export const Default: Story = { render: () => <Demo /> };
/** An iOS browser or an older app takes photos only from the album, and says so. */
export const WithNotice: Story = { render: () => <Demo notice="앱을 업데이트하면 동영상을 보낼 수 있어요" /> };
