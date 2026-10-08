import { useEffect, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { PhotoEditor, type PhotoEdit, type PhotoEditorItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof PhotoEditor> = {
    title: 'web-ui-kit/composites/PhotoEditor',
    component: PhotoEditor,
};
export default meta;

type Story = StoryObj<typeof PhotoEditor>;

/** A photo of `width` × `height`, read as a rendition half that size, with the grid's square preview. */
const photo = (i: number, width: number, height: number): PhotoEditorItem => ({
    id: `p${i}`,
    previewSrc: `https://picsum.photos/seed/dou-editor-${i}/240/240`,
    src: `https://picsum.photos/seed/dou-editor-${i}/${width / 2}/${height / 2}`,
    width,
    height,
    editable: true,
});

const video: PhotoEditorItem = {
    id: 'v1',
    previewSrc: 'https://picsum.photos/seed/dou-editor-video/240/240',
    editable: false,
    kind: 'video',
    durationMs: 75_000,
};

const labels = {
    title: '사진 편집',
    close: '닫기',
    done: '완료',
    crop: '자르기·회전',
    rotateLeft: '왼쪽으로 회전',
    flip: '좌우 반전',
    reset: '원본으로',
    cancel: '취소',
    apply: '적용',
    aspects: {
        free: '자유',
        original: '원본',
        '1:1': '1:1',
        '4:3': '4:3',
        '3:4': '3:4',
        '16:9': '16:9',
        '9:16': '9:16',
    },
    notEditable: '동영상과 GIF는 편집할 수 없어요',
    loading: '사진을 불러오는 중…',
    failed: '사진을 불러오지 못했어요',
    thumbnail: (position: number) => `사진 ${position}`,
};

/**
 * The host's side, reduced: the edits live here, the editor reports Apply, and ✕ throws away what
 * changed since the editor opened (the app asks first; the story does not).
 */
const Demo = ({ initial, readMs = 0 }: { initial: PhotoEditorItem[]; readMs?: number }) => {
    const [open, setOpen] = useState(true);
    const [index, setIndex] = useState(0);
    const [edits, setEdits] = useState<Record<string, PhotoEdit>>({});
    const [snapshot, setSnapshot] = useState<Record<string, PhotoEdit>>({});
    // A slow library: each photo's rendition arrives `readMs` after the editor shows it.
    const [read, setRead] = useState<ReadonlySet<string>>(() => new Set(readMs ? [] : initial.map(item => item.id)));
    useEffect(() => {
        const id = initial[index]?.id;
        if (!open || !id || read.has(id)) return;
        const timer = window.setTimeout(() => setRead(previous => new Set(previous).add(id)), readMs);
        return () => window.clearTimeout(timer);
    }, [open, index, read, readMs, initial]);

    const items = initial.map(item =>
        read.has(item.id) || item.failed
            ? { ...item, edit: edits[item.id] }
            : { ...item, src: undefined, width: undefined, height: undefined }
    );
    return (
        <>
            <button
                onClick={() => {
                    setSnapshot(edits);
                    setOpen(true);
                }}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open editor
            </button>
            <PhotoEditor
                open={open}
                items={items}
                index={index}
                onIndexChange={setIndex}
                onEditChange={(id, edit) => setEdits(previous => ({ ...previous, [id]: edit }))}
                onCancel={() => {
                    setEdits(snapshot);
                    setOpen(false);
                }}
                onDone={() => setOpen(false)}
                onSend={() => setOpen(false)}
                sendLabel={`${items.length}장 보내기`}
                labels={labels}
            />
        </>
    );
};

export const Several: Story = {
    render: () => <Demo initial={[photo(1, 1200, 900), photo(2, 900, 1200), photo(3, 1600, 900)]} />,
};
export const Single: Story = { render: () => <Demo initial={[photo(1, 1200, 900)]} /> };
/** A video among the photos: shown with its poster, the tool greyed and a line saying why. */
export const WithVideo: Story = {
    render: () => <Demo initial={[photo(1, 1200, 900), video, photo(2, 900, 1200)]} />,
};
/** Each photo is read as it is shown: its square preview and a spinner first, the tool greyed meanwhile. */
export const SlowLibrary: Story = {
    render: () => <Demo initial={[photo(1, 1200, 900), photo(2, 900, 1200)]} readMs={1500} />,
};
/** A photo the library could not read. */
export const Failed: Story = {
    render: () => <Demo initial={[{ ...photo(1, 1200, 900), failed: true }, photo(2, 900, 1200)]} />,
};
