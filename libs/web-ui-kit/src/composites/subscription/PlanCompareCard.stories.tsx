import type { Meta, StoryObj } from '@storybook/react';

import { PlanBulletList } from './PlanBulletList';
import { PlanCompareCard } from './PlanCompareCard';

const meta: Meta<typeof PlanCompareCard> = {
    title: 'web-ui-kit/composites/PlanCompareCard',
    component: PlanCompareCard,
    decorators: [
        Story => (
            <div className="w-[375px] px-4 py-4">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof PlanCompareCard>;

/** Free plan: neutral header, hairline border, muted limitation rows. */
export const Free: Story = {
    args: {
        name: 'DoU Home',
        tier: 'free',
        tierLabel: 'FREE',
        headline: '바로 대화를 시작하는 공간',
        children: (
            <PlanBulletList
                items={[
                    { title: '친구와 1:1 대화만 가능해요' },
                    { title: '나만의 클라우드 만들기 제한' },
                    { title: '그룹 대화 제한' },
                ]}
            />
        ),
    },
};

/** Paid plan: lime header, 24% lime border and a soft lime glow. */
export const Paid: Story = {
    args: {
        name: '내 클라우드',
        tier: 'paid',
        tierLabel: 'PRO',
        headline: '내가 만드는 나만의 공간',
        children: (
            <PlanBulletList
                tone="emphasis"
                items={[
                    { title: '나만의 클라우드', description: '플레이스를 만들고 그룹 대화를 자유롭게 관리' },
                    { title: '플레이스 만들기', description: '주제별 공간 만들기' },
                    { title: '그룹 대화방', description: '플레이스 안에서 여러 친구와 대화하기' },
                ]}
            />
        ),
    },
};

/** The two cards as the guide screen stacks them, with the descending-dot decoration between. */
export const Comparison: Story = {
    decorators: [],
    render: () => (
        <div className="flex w-[375px] flex-col items-center px-4 py-4">
            <PlanCompareCard {...(Free.args as never)} />
            <div aria-hidden className="flex flex-col items-center gap-2 py-4">
                <span className="size-2 rounded-full bg-input-border" />
                <span className="size-[11px] rounded-full bg-input-border" />
                <span className="size-[14px] rounded-full bg-input-border" />
            </div>
            <PlanCompareCard {...(Paid.args as never)} />
        </div>
    ),
};
