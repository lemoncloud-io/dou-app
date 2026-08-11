import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { PhotoAttachField } from '@chatic/web-ui-kit';

const meta: Meta<typeof PhotoAttachField> = {
    title: 'web-ui-kit/foundations/PhotoAttachField',
    component: PhotoAttachField,
    decorators: [
        Story => (
            <div className="w-[375px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof PhotoAttachField>;

const MAX = 5;

/** A flat grey JPEG-ish placeholder, so the stories need no network. */
const swatch = (hue: number) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="hsl(${hue} 12% 45%)"/></svg>`
    )}`;

const Demo = ({ initial = [] as string[] }) => {
    const [photos, setPhotos] = useState(initial);
    return (
        <PhotoAttachField
            label="사진 첨부"
            value={photos}
            // Storybook has no real encoding step; stand in with a swatch per pick.
            onSelect={files => setPhotos(prev => [...prev, ...files.map((_, i) => swatch(prev.length * 40 + i * 40))])}
            onRemove={index => setPhotos(prev => prev.filter((_, i) => i !== index))}
            hint={'문제를 확인할 수 있는 화면 캡처 또는\n이미지를 첨부해주세요.'}
            description={`최대 ${MAX}장 • jpg, png`}
            max={MAX}
            removeLabel={index => `${index}번째 사진 삭제`}
        />
    );
};

/** Empty — just the dashed dropzone. */
export const Empty: Story = { render: () => <Demo /> };

/** Some attached; the dropzone stays until the cap. */
export const WithPhotos: Story = { render: () => <Demo initial={[swatch(0), swatch(80), swatch(160)]} /> };

/** At the cap the dropzone disappears and only the strip remains. */
export const Full: Story = {
    render: () => <Demo initial={[swatch(0), swatch(50), swatch(100), swatch(150), swatch(200)]} />,
};

export const Disabled: Story = {
    render: () => (
        <PhotoAttachField
            label="사진 첨부"
            value={[swatch(0)]}
            onSelect={() => undefined}
            onRemove={() => undefined}
            hint={'문제를 확인할 수 있는 화면 캡처 또는\n이미지를 첨부해주세요.'}
            description={`최대 ${MAX}장 • jpg, png`}
            max={MAX}
            disabled
        />
    ),
};
