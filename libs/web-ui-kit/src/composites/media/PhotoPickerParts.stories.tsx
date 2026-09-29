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
