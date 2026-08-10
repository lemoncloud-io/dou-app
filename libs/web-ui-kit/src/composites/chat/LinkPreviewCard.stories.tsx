import type { Meta, StoryObj } from '@storybook/react';

import { LinkPreviewCard } from '@chatic/web-ui-kit';

// Inlined so the stories render identically offline — a remote placeholder service would make
// every story look like the broken-thumbnail case whenever it's unreachable.
const THUMBNAIL = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="#3f7bf5"/><circle cx="56" cy="44" r="18" fill="#ffffff" opacity="0.9"/><rect x="20" y="74" width="72" height="10" rx="5" fill="#ffffff" opacity="0.7"/></svg>`
)}`;

const meta: Meta<typeof LinkPreviewCard> = {
    title: 'web-ui-kit/composites/LinkPreviewCard',
    component: LinkPreviewCard,
    args: {
        url: 'https://example.com/post/1',
        siteName: 'Example News',
        title: '개발자가 알아야 할 웹뷰 브릿지 설계',
        description: '네이티브 셸과 웹 클라이언트가 메시지 하나로 대화하는 방법을 정리했습니다.',
        imageUrl: THUMBNAIL,
    },
    // The card sizes to its container; a chat bubble column caps it around this width.
    decorators: [Story => <div style={{ maxWidth: 280 }}>{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof LinkPreviewCard>;

// Everything present — the shape most og-complete pages produce.
export const Full: Story = {};

// No og:image: the text column takes the whole card.
export const WithoutThumbnail: Story = { args: { imageUrl: undefined } };

// No og:site_name — common on personal sites and blogs.
export const WithoutSiteName: Story = { args: { siteName: undefined } };

// og:title only. Still a usable card; anything less isn't rendered at all.
export const TitleOnly: Story = { args: { siteName: undefined, description: undefined, imageUrl: undefined } };

// Long unbroken strings must truncate rather than widen the card.
export const OverflowingText: Story = {
    args: {
        siteName: 'A'.repeat(60),
        title: 'https://example.com/an/extremely/long/path/that/never/wraps/on/its/own/at/all',
        description: '설명이 길어지면 두 줄까지만 보이고 그 아래는 잘립니다. '.repeat(4),
    },
};

// A thumbnail URL that 404s — the image is dropped instead of showing a broken glyph.
export const BrokenThumbnail: Story = { args: { imageUrl: 'https://example.invalid/missing.png' } };
