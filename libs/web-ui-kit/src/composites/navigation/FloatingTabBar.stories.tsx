import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { IconNavChat, IconNavChatSolid, IconNavMy, IconNavMySolid } from '../../resources/icons';
import { FloatingTabBar } from './FloatingTabBar';

const meta: Meta<typeof FloatingTabBar> = {
    title: 'web-ui-kit/composites/FloatingTabBar',
    component: FloatingTabBar,
    // The bar self-positions with `fixed`; give the canvas a phone-sized, relative
    // frame so it pins to the bottom of the frame rather than the whole viewport.
    decorators: [
        Story => (
            <div className="relative h-[720px] w-[375px] overflow-hidden border border-input-border bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof FloatingTabBar>;

const Demo = ({ badge }: { badge?: number }) => {
    const [active, setActive] = useState('chat');
    return (
        <FloatingTabBar
            items={[
                {
                    key: 'chat',
                    label: '채팅',
                    icon: <IconNavChat />,
                    activeIcon: <IconNavChatSolid />,
                    badge,
                    active: active === 'chat',
                },
                {
                    key: 'my',
                    label: 'MY',
                    icon: <IconNavMy />,
                    activeIcon: <IconNavMySolid />,
                    active: active === 'my',
                },
            ]}
            onSelect={setActive}
        />
    );
};

export const Default: Story = { render: () => <Demo /> };

export const WithUnreadBadge: Story = { render: () => <Demo badge={1200} /> };

/** Coloured rows behind the bar, so the frost, the saturation lift and the rims can be judged. */
export const OverContent: Story = {
    render: () => (
        <>
            <div className="flex h-full flex-col justify-end gap-2 p-4 pb-6">
                {['bg-glyph-green', 'bg-glyph-indigo', 'bg-glyph-cyan', 'bg-brand-ink', 'bg-primary'].map(fill => (
                    <div key={fill} className={`h-12 shrink-0 rounded-xl ${fill}`} />
                ))}
            </div>
            <Demo badge={5} />
        </>
    ),
};
