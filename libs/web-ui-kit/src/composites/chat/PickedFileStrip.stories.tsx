import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { PickedFileStrip, type PickedFileItem } from '@chatic/web-ui-kit';

const MB = 1024 * 1024;

const FILES: PickedFileItem[] = [
    { id: '1', name: '계약서.pdf', size: 1.2 * MB },
    { id: '2', name: '2026 하반기 사업계획 및 예산 편성안 최종 수정본.docx', size: 812 * 1024 },
    { id: '3', name: 'Budget.xlsx', size: 64 * 1024 },
    { id: '4', name: '회의록 v1.2.hwpx', size: 320 * 1024 },
    { id: '5', name: 'clip.mp4', size: 48 * MB },
];

const meta: Meta<typeof PickedFileStrip> = {
    title: 'web-ui-kit/composites/PickedFileStrip',
    component: PickedFileStrip,
    args: { files: FILES.slice(0, 1), label: '보낼 파일', onRemove: () => undefined },
};
export default meta;

type Story = StoryObj<typeof PickedFileStrip>;

export const One: Story = {};
/** More than fit: the row scrolls sideways, and a long name keeps its extension. */
export const Several: Story = { args: { files: FILES } };

/** Press × to remove a file; the row is gone once the last one is. */
const Removable = () => {
    const [files, setFiles] = useState(FILES);
    return (
        <div className="w-[360px] bg-muted p-3">
            <PickedFileStrip
                files={files}
                label="보낼 파일"
                onRemove={id => setFiles(current => current.filter(file => file.id !== id))}
                removeLabel={name => `${name} 빼기`}
            />
        </div>
    );
};
export const Interactive: Story = { render: () => <Removable /> };
