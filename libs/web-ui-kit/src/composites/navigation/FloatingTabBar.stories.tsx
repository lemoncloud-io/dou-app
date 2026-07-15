import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { IconChatBubble, IconUser } from '../../resources/icons';
import { FloatingTabBar } from './FloatingTabBar';

const meta: Meta<typeof FloatingTabBar> = {
    title: 'web-ui-kit/composites/FloatingTabBar',
    component: FloatingTabBar,
    // The bar self-positions with `fixed`; give the canvas a phone-sized, relative
    // frame so it pins to the bottom of the frame rather than the whole viewport.
    decorators: [
        Story => (
            <div className="relative h-[720px] w-[390px] overflow-hidden border border-input-border bg-background">
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
                    icon: <IconChatBubble className="size-6" />,
                    badge,
                    active: active === 'chat',
                },
                {
                    key: 'my',
                    label: 'MY',
                    icon: <IconUser className="size-6" />,
                    active: active === 'my',
                },
            ]}
            onSelect={setActive}
        />
    );
};

export const Default: Story = { render: () => <Demo /> };

export const WithUnreadBadge: Story = { render: () => <Demo badge={1200} /> };
