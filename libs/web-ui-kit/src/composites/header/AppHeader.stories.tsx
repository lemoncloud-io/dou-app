import { DropdownMenuItem } from '@chatic/ui-kit/components/ui/dropdown-menu';

import type { Meta, StoryObj } from '@storybook/react';

import { AppHeader } from '@chatic/web-ui-kit';
import { ProfileAvatar } from '@chatic/web-ui-kit';

const svg = (size: number, fill: string) =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${fill}"/></svg>`
    );

const meta: Meta<typeof AppHeader> = {
    title: 'web-ui-kit/composites/AppHeader',
    component: AppHeader,
    decorators: [
        Story => (
            <div className="w-[375px] border border-input-border">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof AppHeader>;

// Type 1 — no cloud connected, no place profile yet: DoU brand mark + default avatar glyph.
export const NoCloud: Story = {
    args: {
        kind: 'no-cloud',
        onSwitcher: () => undefined,
        planTier: 'free',
        onPlanClick: () => undefined,
        onSearch: () => undefined,
        onProfile: () => undefined,
        safeArea: false,
    },
};

// Type 1 — no cloud connected, with a place profile picture on the right.
export const NoCloudWithPlaceAvatar: Story = {
    args: {
        ...NoCloud.args,
        avatar: <ProfileAvatar src={svg(36, '#102346')} size={36} />,
    },
};

// Type 2 — cloud connected: owner-set cloud avatar + cloud name (+ place profile on the right).
export const Cloud: Story = {
    args: {
        kind: 'cloud',
        name: '<클라우드 명>',
        cloudAvatar: <img src={svg(46, '#e07a5f')} alt="" className="size-full object-cover" />,
        onSwitcher: () => undefined,
        planTier: 'pro',
        onPlanClick: () => undefined,
        onSearch: () => undefined,
        avatar: <ProfileAvatar src={svg(36, '#102346')} size={36} />,
        onProfile: () => undefined,
        safeArea: false,
    },
};

// Cloud connected, but the owner hasn't set a profile photo yet — falls back to
// a Slack-style initials avatar derived from the cloud name.
export const CloudWithInitialsAvatar: Story = {
    args: {
        ...Cloud.args,
        name: '스터디 플레이스',
        cloudAvatar: undefined,
    },
};

// Cloud switcher opens a DropdownMenu (Radix owns open state; AppHeader stays stateless).
export const CloudWithDropdown: Story = {
    args: {
        ...Cloud.args,
        switcherMenu: (
            <>
                <DropdownMenuItem>DoU Home</DropdownMenuItem>
                <DropdownMenuItem>Sunny Place</DropdownMenuItem>
                <DropdownMenuItem>클라우드 추가</DropdownMenuItem>
            </>
        ),
    },
};
