import type { Meta, StoryObj } from '@storybook/react';

import { EditedPhotoImage, IDENTITY_PHOTO_EDIT, type PhotoEdit } from '@chatic/web-ui-kit';

const meta: Meta<typeof EditedPhotoImage> = {
    title: 'web-ui-kit/composites/EditedPhotoImage',
    component: EditedPhotoImage,
};
export default meta;

type Story = StoryObj<typeof EditedPhotoImage>;

// A 1200 × 900 photo, drawn from a rendition of half that size: the edit is measured against the
// original, and the rendition is stretched to it.
const SRC = 'https://picsum.photos/seed/dou-edit/600/450';
const WIDTH = 1200;
const HEIGHT = 900;

const EDITS: { name: string; edit: PhotoEdit }[] = [
    { name: 'Unedited', edit: IDENTITY_PHOTO_EDIT },
    { name: 'Turned left', edit: { ...IDENTITY_PHOTO_EDIT, rotation: 270 } },
    { name: 'Mirrored', edit: { ...IDENTITY_PHOTO_EDIT, flipH: true } },
    { name: 'Right half', edit: { ...IDENTITY_PHOTO_EDIT, crop: { x: 0.5, y: 0, width: 0.5, height: 1 } } },
    {
        name: 'Square, turned',
        edit: { rotation: 90, flipH: false, crop: { x: 0, y: 0.125, width: 1, height: 0.75 }, aspect: '1:1' },
    },
];

const Grid = ({ fit, size }: { fit: 'contain' | 'cover'; size: number }) => (
    <div className="flex flex-wrap gap-4">
        {EDITS.map(({ name, edit }) => (
            <figure key={name} className="flex flex-col gap-1">
                <div className="bg-black" style={{ width: size, height: size }}>
                    <EditedPhotoImage src={SRC} width={WIDTH} height={HEIGHT} edit={edit} fit={fit} />
                </div>
                <figcaption className="text-[12px] text-foreground">{name}</figcaption>
            </figure>
        ))}
    </div>
);

/** The editor's page: the whole edited result, letterboxed. */
export const Contain: Story = { render: () => <Grid fit="contain" size={180} /> };
/** The picked strip's and the editor strip's thumbnails: the edited result filling a square. */
export const Cover: Story = { render: () => <Grid fit="cover" size={64} /> };
/** Resize the frame: the photo re-fits its box. */
export const Resizable: Story = {
    render: () => (
        <div className="h-[320px] w-[320px] resize overflow-hidden bg-black">
            <EditedPhotoImage src={SRC} width={WIDTH} height={HEIGHT} edit={EDITS[4].edit} />
        </div>
    ),
};
