import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { PhotoGridSheet, type PhotoItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof PhotoGridSheet> = {
    title: 'web-ui-kit/composites/PhotoGridSheet',
    component: PhotoGridSheet,
};
export default meta;

type Story = StoryObj<typeof PhotoGridSheet>;

const photo = (i: number): PhotoItem => ({ id: `p${i}`, src: `https://picsum.photos/seed/dou-${i}/240/240` });
const ALBUMS = [
    { id: 'all', title: '최근 항목', count: 123456, coverSrc: photo(1).src },
    { id: 'fav', title: '즐겨찾기', count: 2541, coverSrc: photo(2).src },
    { id: 'new', title: '최근 추가된 항목', count: 2458, coverSrc: photo(3).src },
];

const Demo = ({ initialPicked = 0 }: { initialPicked?: number }) => {
    const [open, setOpen] = useState(true);
    const [albumsOpen, setAlbumsOpen] = useState(false);
    const [album, setAlbum] = useState(ALBUMS[0]);
    const [count, setCount] = useState(30);
    const photos = Array.from({ length: count }, (_, i) => photo(i));
    const [picked, setPicked] = useState<PhotoItem[]>(photos.slice(0, initialPicked));
    const toggle = (item: PhotoItem) =>
        setPicked(prev => (prev.some(p => p.id === item.id) ? prev.filter(p => p.id !== item.id) : [...prev, item]));
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open photo grid
            </button>
            <PhotoGridSheet
                open={open}
                onOpenChange={setOpen}
                albumTitle={album.title}
                albumsOpen={albumsOpen}
                onToggleAlbums={() => setAlbumsOpen(v => !v)}
                albums={ALBUMS}
                onSelectAlbum={id => {
                    setAlbum(ALBUMS.find(a => a.id === id) ?? ALBUMS[0]);
                    setAlbumsOpen(false);
                }}
                formatAlbumCount={n => n.toLocaleString('ko-KR')}
                photos={photos}
                picked={picked}
                onToggle={toggle}
                max={10}
                onCamera={() => undefined}
                hasMore={count < 90}
                onLoadMore={() => setCount(c => c + 30)}
                sendLabel={`${picked.length}장 보내기`}
                onSend={() => setOpen(false)}
                labels={{ camera: '카메라', close: '닫기' }}
            />
        </>
    );
};

export const Empty: Story = { render: () => <Demo /> };
export const Picked: Story = { render: () => <Demo initialPicked={3} /> };
export const AtTheCap: Story = { render: () => <Demo initialPicked={10} /> };
