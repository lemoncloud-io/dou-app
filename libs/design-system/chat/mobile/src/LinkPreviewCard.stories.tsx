import type { Meta, StoryObj } from '@storybook/react';

import { LinkPreviewCard } from './index';

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
    decorators: [Story => <div style={{ maxWidth: 280 }}>{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof LinkPreviewCard>;

export const Full: Story = {};

export const WithoutThumbnail: Story = { args: { imageUrl: undefined } };

export const WithoutSiteName: Story = { args: { siteName: undefined } };

export const TitleOnly: Story = { args: { siteName: undefined, description: undefined, imageUrl: undefined } };

export const OverflowingText: Story = {
    args: {
        siteName: 'A'.repeat(60),
        title: 'https://example.com/an/extremely/long/path/that/never/wraps/on/its/own/at/all',
        description: '설명이 길어지면 두 줄까지만 보이고 그 아래는 잘립니다. '.repeat(4),
    },
};

export const BrokenThumbnail: Story = { args: { imageUrl: 'https://example.invalid/missing.png' } };
