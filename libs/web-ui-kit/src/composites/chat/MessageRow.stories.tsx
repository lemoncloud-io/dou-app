import type { Meta, StoryObj } from '@storybook/react';

import { MessageBubble } from '@chatic/web-ui-kit';
import { MessageRow } from '@chatic/web-ui-kit';
import { ProfileAvatar } from '@chatic/web-ui-kit';

const AVATAR =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="39" height="39"><rect width="39" height="39" fill="%2390c304"/></svg>'
    );

const meta: Meta<typeof MessageRow> = {
    title: 'web-ui-kit/composites/MessageRow',
    component: MessageRow,
    decorators: [
        Story => (
            <div className="w-[375px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof MessageRow>;

export const Other: Story = {
    render: () => (
        <MessageRow variant="other" avatar={<ProfileAvatar src={AVATAR} size={39} />} time="오전 11:58" unread={1}>
            <MessageBubble variant="other">Lorem ipsum dolor sit amet</MessageBubble>
            <MessageBubble variant="other">두 번째 말풍선</MessageBubble>
        </MessageRow>
    ),
};

export const Mine: Story = {
    render: () => (
        <MessageRow variant="mine" time="오후 12:10" unread={1}>
            <MessageBubble variant="mine">Lorem ipsum dolor sit amet</MessageBubble>
        </MessageRow>
    ),
};
