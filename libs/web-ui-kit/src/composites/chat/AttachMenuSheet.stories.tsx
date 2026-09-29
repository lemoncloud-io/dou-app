import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AttachMenuSheet } from '@chatic/web-ui-kit';

const meta: Meta<typeof AttachMenuSheet> = {
    title: 'web-ui-kit/composites/AttachMenuSheet',
    component: AttachMenuSheet,
};
export default meta;

type Story = StoryObj<typeof AttachMenuSheet>;

const Demo = ({ withRecent }: { withRecent: boolean }) => {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open attach menu
            </button>
            <AttachMenuSheet
                open={open}
                onOpenChange={setOpen}
                labels={{ photo: '사진', camera: '카메라', file: '파일' }}
                recent={withRecent ? <div className="h-[142px] w-full bg-muted" /> : undefined}
                onPhoto={() => setOpen(false)}
                onCamera={() => setOpen(false)}
                onFile={() => setOpen(false)}
            />
        </>
    );
};

export const ActionsOnly: Story = { render: () => <Demo withRecent={false} /> };
export const WithRecentStrip: Story = { render: () => <Demo withRecent /> };
