import type { Meta, StoryObj } from '@storybook/react';

import { ComposerLockButton } from './ComposerLockButton';
import { MessageInput } from './MessageInput';

const meta: Meta<typeof ComposerLockButton> = {
    title: 'web-ui-kit/foundations/ComposerLockButton',
    component: ComposerLockButton,
};
export default meta;

type Story = StoryObj<typeof ComposerLockButton>;

export const Default: Story = { args: { onClick: () => undefined } };

/** In a locked composer: the field takes no input, and the padlock is the one thing left to tap. */
export const InLockedComposer: Story = {
    render: () => (
        <MessageInput
            value=""
            onChange={() => undefined}
            disabled
            placeholder="Input is locked"
            leadingSlot={<ComposerLockButton onClick={() => undefined} />}
        />
    ),
};
