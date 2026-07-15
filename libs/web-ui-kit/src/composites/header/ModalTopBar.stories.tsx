import type { Meta, StoryObj } from '@storybook/react';

import { IconBack, IconButton, IconMore, ModalTopBar } from '@chatic/web-ui-kit';

const meta: Meta<typeof ModalTopBar> = {
    title: 'web-ui-kit/composites/ModalTopBar',
    component: ModalTopBar,
    args: { title: '프로필 설정', onClose: () => undefined, safeArea: false },
    decorators: [
        Story => (
            <div className="w-[375px] border border-input-border">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof ModalTopBar>;

export const Default: Story = {};

// Design-guide TopBar: back + title + more, with a bottom hairline.
export const BackTitleMore: Story = {
    args: {
        title: 'Title',
        onClose: undefined,
        divider: true,
        leftSlot: <IconButton icon={<IconBack className="size-[26px]" />} label="뒤로" />,
        rightSlot: <IconButton icon={<IconMore className="size-[26px]" />} label="더보기" />,
    },
};
