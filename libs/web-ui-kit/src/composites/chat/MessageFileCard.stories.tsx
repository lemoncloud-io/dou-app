import { useEffect, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { MessageFileCard, type MessageFileDownloadState } from '@chatic/web-ui-kit';

const meta: Meta<typeof MessageFileCard> = {
    title: 'web-ui-kit/composites/MessageFileCard',
    component: MessageFileCard,
    args: { name: 'Quarterly report.pdf', size: 2.4 * 1024 * 1024 },
};
export default meta;

type Story = StoryObj<typeof MessageFileCard>;

export const Idle: Story = {};
export const Downloading: Story = { args: { download: 'downloading', progress: 0.4 } };
/** The transfer has not reported a total yet. */
export const DownloadingUnknown: Story = { args: { download: 'downloading' } };
export const Done: Story = { args: { download: 'done' } };
/** An app built before it could save files: the notice instead of the button. */
export const Unavailable: Story = {
    args: { download: 'unavailable', labels: { unavailable: '앱을 업데이트하면 받을 수 있어요' } },
};
export const Sending: Story = { args: { name: '회의록 v1.2.hwpx', size: 320 * 1024, state: 'sending' } };
export const Failed: Story = { args: { name: '회의록 v1.2.hwpx', size: 320 * 1024, state: 'failed' } };
export const Broken: Story = { args: { state: 'broken', labels: { broken: '열 수 없음' } } };
/** An old upload with no name: the fallback label and the generic glyph. */
export const Untitled: Story = { args: { name: undefined, size: 18 * 1024, labels: { untitled: '파일' } } };
/** The body is cut in the middle; the extension stays. */
export const LongName: Story = {
    args: { name: '2026 하반기 사업계획 및 예산 편성안 최종 수정본 (검토 의견 반영) 제출용.docx', size: 812 * 1024 },
};

/** One card per kind, the way a message's documents stack. */
export const Kinds: Story = {
    render: () => (
        <div className="flex flex-col gap-1">
            {['계약서.pdf', 'Proposal.docx', 'Budget.xlsx', 'Pitch.pptx', '보고서.hwp', 'notes.txt', 'archive.zip'].map(
                name => (
                    <MessageFileCard key={name} name={name} size={1.2 * 1024 * 1024} />
                )
            )}
        </div>
    ),
};

/** Press the button: idle → a ring filling → done; press again while it fills to cancel. */
const Interactive = () => {
    const [download, setDownload] = useState<MessageFileDownloadState>('idle');
    const [progress, setProgress] = useState(0);
    useEffect(() => {
        if (download !== 'downloading') return;
        const timer = setInterval(() => setProgress(value => Math.min(1, value + 0.1)), 300);
        return () => clearInterval(timer);
    }, [download]);
    useEffect(() => {
        if (download === 'downloading' && progress >= 1) setDownload('done');
    }, [download, progress]);
    return (
        <MessageFileCard
            name="Quarterly report.pdf"
            size={2.4 * 1024 * 1024}
            download={download}
            progress={progress}
            onDownload={() => {
                setProgress(0);
                setDownload('downloading');
            }}
            onCancel={() => setDownload('idle')}
            onOpen={() => setDownload('idle')}
        />
    );
};
export const InteractiveDownload: Story = { render: () => <Interactive /> };
