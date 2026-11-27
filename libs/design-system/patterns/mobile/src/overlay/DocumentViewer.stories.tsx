import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Download, Share } from 'lucide-react';

import { DocumentViewer, MediaViewerActionButton, type DocumentViewerPages, type DocumentViewerStatus } from './index';

const meta: Meta<typeof DocumentViewer> = {
    title: 'web-ui-kit/composites/DocumentViewer',
    component: DocumentViewer,
};
export default meta;

type Story = StoryObj<typeof DocumentViewer>;

const fakePages = (pageCount: number): DocumentViewerPages => ({
    pageCount,
    aspectRatio: Math.SQRT2,
    renderPage: (page, canvas, cssWidth) => {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(cssWidth * ratio);
        canvas.height = Math.round(cssWidth * Math.SQRT2 * ratio);
        const context = canvas.getContext('2d');
        if (context) {
            context.scale(ratio, ratio);
            context.fillStyle = '#fff';
            context.fillRect(0, 0, cssWidth, cssWidth * Math.SQRT2);
            context.fillStyle = '#102346';
            context.font = 'bold 20px sans-serif';
            context.fillText(`Page ${page}`, 32, 56);
            context.fillStyle = '#E5E7EB';
            for (let line = 0; line < 8; line += 1) {
                context.fillRect(32, 90 + line * 18, cssWidth - 64 - (line % 3) * 40, 8);
            }
        }
        return { done: Promise.resolve(Math.SQRT2), cancel: () => undefined };
    },
});

const labels = {
    close: '닫기',
    loading: '문서 여는 중',
    failed: '미리 볼 수 없는 파일이에요.\n저장하거나 공유해서 다른 앱으로 열어 보세요.',
};

const footer = (withShare: boolean) => () => (
    <>
        {withShare ? (
            <MediaViewerActionButton label="파일 공유" onClick={() => undefined}>
                <Share className="size-5" aria-hidden="true" />
            </MediaViewerActionButton>
        ) : (
            <span aria-hidden="true" />
        )}
        <MediaViewerActionButton label="파일 저장" onClick={() => undefined}>
            <Download className="size-5" aria-hidden="true" />
        </MediaViewerActionButton>
    </>
);

const Demo = ({
    status,
    pageCount = 12,
    withShare = true,
}: {
    status: DocumentViewerStatus;
    pageCount?: number;
    withShare?: boolean;
}) => {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open viewer
            </button>
            <DocumentViewer
                open={open}
                name="2026 서비스 제안서.pdf"
                status={status}
                pages={status === 'ready' ? fakePages(pageCount) : undefined}
                onClose={() => setOpen(false)}
                renderFooter={footer(withShare)}
                labels={labels}
            />
        </>
    );
};

export const Pages: Story = { render: () => <Demo status="ready" /> };
export const OnePage: Story = { render: () => <Demo status="ready" pageCount={1} /> };
export const WithoutShare: Story = { render: () => <Demo status="ready" withShare={false} /> };
export const Opening: Story = { render: () => <Demo status="loading" /> };
export const CannotPreview: Story = { render: () => <Demo status="failed" /> };
