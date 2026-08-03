import type { Meta, StoryObj } from '@storybook/react';

import myCloudIllustration from '../../resources/assets/my-cloud.svg';
import { PromoBanner } from './PromoBanner';

const meta: Meta<typeof PromoBanner> = {
    title: 'web-ui-kit/composites/PromoBanner',
    component: PromoBanner,
    args: {
        title: '나만의 클라우드에서 플레이스를\n만들고 함께 대화하세요!',
        icon: <img src={myCloudIllustration} alt="" className="size-12" />,
        dismissLabel: '닫기',
    },
    decorators: [
        Story => (
            <div className="w-[375px] px-4">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof PromoBanner>;

/** Relay home: inline action link plus dismiss. */
export const HomeVariant: Story = {
    args: { actionLabel: '클라우드 추가', onAction: () => undefined, onDismiss: () => undefined },
};

/** Cloud switcher sheet: dismiss only — the section footer already carries the add button. */
export const SheetVariant: Story = {
    args: { onDismiss: () => undefined },
};

/** No affordances at all — pure notice. */
export const CopyOnly: Story = {};
