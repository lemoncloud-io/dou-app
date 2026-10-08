import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AlbumList, MessageInput, PhotoGridTile, RecentPhotoStrip, SelectedPhotoStrip } from '@chatic/web-ui-kit';

const src = (i: number) => `https://picsum.photos/seed/dou-${i}/240/240`;
const photos = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, src: src(i) }));

const meta: Meta = { title: 'web-ui-kit/composites/PhotoPickerParts' };
export default meta;

type Story = StoryObj;

export const Recent: Story = {
    render: () => (
        <div className="w-[375px]">
            <RecentPhotoStrip
                title="최근 사진"
                seeAllLabel="전체 보기"
                onSeeAll={() => undefined}
                photos={photos.slice(0, 4)}
                onSelect={() => undefined}
            />
        </div>
    ),
};

/** The attach panel's row: picks in place, numbered in pick order, locked at the cap (3 here). */
const RecentPickingDemo = () => {
    const [picked, setPicked] = useState<string[]>(['p1']);
    return (
        <div className="w-[375px]">
            <RecentPhotoStrip
                title="최근 사진"
                seeAllLabel="전체 보기"
                onSeeAll={() => undefined}
                photos={[...photos, { id: 'v0', src: src(9), kind: 'video', durationMs: 42_000 }]}
                picked={picked}
                onToggle={id =>
                    setPicked(previous => (previous.includes(id) ? previous.filter(p => p !== id) : [...previous, id]))
                }
                max={3}
            />
        </div>
    );
};

export const RecentPicking: Story = { render: () => <RecentPickingDemo /> };

export const Tiles: Story = {
    render: () => (
        <div className="grid w-[375px] grid-cols-3 gap-1">
            <PhotoGridTile src={src(1)} onToggle={() => undefined} label="1" />
            <PhotoGridTile src={src(2)} order={1} onToggle={() => undefined} label="2" />
            <PhotoGridTile src={src(3)} order={10} onToggle={() => undefined} label="3" />
        </div>
    ),
};

export const Picked: Story = {
    render: () => (
        <div className="w-[375px]">
            <SelectedPhotoStrip photos={photos} onRemove={() => undefined} />
        </div>
    ),
};

/**
 * Tappable thumbnails (the app opens its editor on one), the first photo edited — turned and cropped,
 * drawn from a rendition of the whole photo, with the pencil mark.
 */
export const PickedAndEdited: Story = {
    render: () => (
        <div className="w-[375px]">
            <SelectedPhotoStrip
                photos={[
                    {
                        ...photos[0],
                        edited: {
                            src: 'https://picsum.photos/seed/dou-0/600/450',
                            width: 1200,
                            height: 900,
                            edit: {
                                rotation: 90,
                                flipH: false,
                                crop: { x: 0, y: 0.25, width: 1, height: 0.5 },
                                aspect: 'free',
                            },
                        },
                    },
                    ...photos.slice(1),
                ]}
                onRemove={() => undefined}
                onSelect={() => undefined}
                selectLabel={position => `사진 ${position} 편집`}
                editedLabel="편집됨"
            />
        </div>
    ),
};

/**
 * The compact row a chat composer keeps above its field while photos wait for its send button, laid
 * out the way the room lays it: inside the composer's 16px gutter, flush with the pill and 8px above
 * it, over a photo message scrolling behind. Remove all three to see the button need text.
 */
const PickedAboveComposerDemo = () => {
    const [picked, setPicked] = useState(() => [
        photos[0],
        { id: 'v0', src: src(9), kind: 'video' as const, durationMs: 42_000 },
        photos[2],
    ]);
    const [value, setValue] = useState('');
    return (
        <div className="relative h-[320px] w-[375px] overflow-hidden bg-background">
            <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-[15px]">
                <p className="ml-auto w-fit rounded-2xl bg-brand-ink px-3 py-2 text-white">Here are the photos</p>
                <img src={src(4)} alt="" className="ml-auto h-40 w-full rounded-xl object-cover" />
            </div>
            <div className="absolute inset-x-0 bottom-0 px-4 pb-2 pt-2">
                <SelectedPhotoStrip
                    size="compact"
                    label="Photos to send"
                    className="mb-2"
                    photos={picked}
                    onRemove={id => setPicked(previous => previous.filter(photo => photo.id !== id))}
                    onSelect={() => undefined}
                />
                <MessageInput
                    value={value}
                    onChange={setValue}
                    onSend={() => setValue('')}
                    sendReady={picked.length > 0}
                    placeholder="Message"
                />
            </div>
        </div>
    );
};

export const PickedAboveComposer: Story = { render: () => <PickedAboveComposerDemo /> };

/**
 * How the strip moves, in both sizes. Pick the first photo and it opens, pushing what is under it down
 * (a stand-in grid for `regular`; the composer's strip rises above the field for `compact`); pick more
 * and each widens in, the row scrolling along once it overflows; remove one and the rest slide over;
 * remove the last and it closes. With reduced motion turned on in the OS, all of it is instant.
 */
const PickedMotionDemo = () => {
    const [size, setSize] = useState<'regular' | 'compact'>('regular');
    const [picked, setPicked] = useState<typeof photos>([]);
    const [next, setNext] = useState(0);
    const [exits, setExits] = useState(0);
    const add = (count = 1) => {
        const added = Array.from({ length: count }, (_, i) => ({
            id: `m${next + i}`,
            src: src(10 + ((next + i) % 30)),
        }));
        setNext(value => value + count);
        setPicked(previous => [...previous, ...added]);
    };
    const remove = (id: string) => setPicked(previous => previous.filter(photo => photo.id !== id));
    const button = 'rounded-full bg-muted px-3 py-1.5 text-[13px] font-medium text-foreground disabled:opacity-40';
    const strip = (
        <SelectedPhotoStrip
            size={size}
            label={size === 'compact' ? 'Photos to send' : undefined}
            className={size === 'compact' ? 'mb-2' : undefined}
            photos={picked}
            onRemove={remove}
            onSelect={remove}
            selectLabel={position => `Remove photo ${position} (tap)`}
            onExited={() => setExits(value => value + 1)}
        />
    );
    return (
        <div className="w-[375px] space-y-3">
            <div className="flex flex-wrap gap-2">
                <button type="button" className={button} onClick={() => add()}>
                    Pick one
                </button>
                <button type="button" className={button} onClick={() => add(3)}>
                    Pick three
                </button>
                <button
                    type="button"
                    className={button}
                    disabled={picked.length === 0}
                    onClick={() => remove(picked[0].id)}
                >
                    Remove first
                </button>
                <button
                    type="button"
                    className={button}
                    disabled={picked.length < 3}
                    onClick={() => remove(picked[1].id)}
                >
                    Remove second
                </button>
                <button type="button" className={button} disabled={picked.length === 0} onClick={() => setPicked([])}>
                    Clear
                </button>
                <button
                    type="button"
                    className={button}
                    onClick={() => setSize(value => (value === 'regular' ? 'compact' : 'regular'))}
                >
                    Size: {size}
                </button>
            </div>
            <p className="text-[12px] text-description">
                {picked.length} picked · closed {exits} time(s). Tap a thumbnail or its × to remove it.
            </p>
            {size === 'regular' ? (
                <div className="flex h-[420px] flex-col overflow-hidden rounded-t-[20px] border border-input-border bg-surface">
                    {strip}
                    <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-1 overflow-hidden px-1">
                        {Array.from({ length: 12 }, (_, i) => (
                            <img key={i} src={src(40 + i)} alt="" className="aspect-square w-full object-cover" />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="relative h-[320px] overflow-hidden border border-input-border bg-background">
                    <div className="absolute inset-x-0 bottom-0 px-4 pb-2 pt-2">
                        {strip}
                        <MessageInput
                            value=""
                            onChange={() => undefined}
                            onSend={() => undefined}
                            sendReady={picked.length > 0}
                            placeholder="Message"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export const PickedMotion: Story = { render: () => <PickedMotionDemo /> };

export const Albums: Story = {
    render: () => (
        <div className="w-[375px]">
            <AlbumList
                albums={[
                    { id: 'all', title: '최근 항목', count: 123456, coverSrc: src(1) },
                    { id: 'video', title: '비디오', count: 1234 },
                ]}
                onSelect={() => undefined}
                formatCount={n => n.toLocaleString('ko-KR')}
            />
        </div>
    ),
};
