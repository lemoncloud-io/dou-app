import type { Meta, StoryObj } from '@storybook/react';

import { AlbumList, PhotoGridTile, RecentPhotoStrip, SelectedPhotoStrip } from '@chatic/web-ui-kit';

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
