import { useEffect, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { PhotoGridSheet, type PhotoGridRange, type PhotoItem } from '@chatic/web-ui-kit';

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

/** A 2,000-photo album whose pages arrive a moment after the grid shows them, as the app's do. */
const COUNT = 2000;
const PAGE = 60;

const Demo = ({ initialPicked = 0, firstPageMs = 0 }: { initialPicked?: number; firstPageMs?: number }) => {
    const [open, setOpen] = useState(true);
    // The first page's round trip: skeleton tiles until it lands.
    const [ready, setReady] = useState(firstPageMs === 0);
    useEffect(() => {
        if (ready) return;
        const timer = window.setTimeout(() => setReady(true), firstPageMs);
        return () => window.clearTimeout(timer);
    }, [ready, firstPageMs]);
    const [albumsOpen, setAlbumsOpen] = useState(false);
    const [album, setAlbum] = useState(ALBUMS[0]);
    const [columns, setColumns] = useState(3);
    const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set([0]));
    const loadRange = (range: PhotoGridRange) => {
        const pages: number[] = [];
        for (let page = Math.floor(range.start / PAGE); page * PAGE < range.end; page += 1) pages.push(page);
        window.setTimeout(() => setLoaded(previous => new Set([...previous, ...pages])), 200);
    };
    const [picked, setPicked] = useState<PhotoItem[]>(Array.from({ length: initialPicked }, (_, i) => photo(i)));
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
                count={ready ? COUNT : 0}
                loading={!ready}
                photoAt={index => (loaded.has(Math.floor(index / PAGE)) ? photo(index) : undefined)}
                onVisibleRangeChange={loadRange}
                columns={columns}
                onColumnsChange={setColumns}
                picked={picked}
                onToggle={toggle}
                max={10}
                onCamera={() => undefined}
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
export const FirstPageLoading: Story = { render: () => <Demo firstPageMs={2500} /> };
