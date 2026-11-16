import type { Meta, StoryObj } from '@storybook/react';

import { IconDownload, IconShare, IconTrash } from '../../resources/icons';
import { type FileSelectionAction, FileSelectionActionBar } from './FileSelectionActionBar';

const actions = (state: 'off' | 'on' | 'deleteOnly'): FileSelectionAction[] => [
    {
        key: 'save',
        icon: <IconDownload size={24} />,
        label: '저장',
        onPress: () => undefined,
        disabled: state !== 'on',
    },
    {
        key: 'share',
        icon: <IconShare size={24} />,
        label: '공유',
        onPress: () => undefined,
        disabled: state !== 'on',
    },
    {
        key: 'delete',
        icon: <IconTrash size={24} />,
        label: '삭제',
        onPress: () => undefined,
        disabled: state === 'off',
        destructive: true,
    },
];

const meta: Meta<typeof FileSelectionActionBar> = {
    title: 'web-ui-kit/composites/FileSelectionActionBar',
    component: FileSelectionActionBar,
    decorators: [
        Story => (
            <div className="relative h-[240px] w-[375px] overflow-hidden border border-input-border bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof FileSelectionActionBar>;

/** Figma 6082:23283 — nothing picked: every action off. */
export const Disabled: Story = { args: { actions: actions('off') } };

/** Figma 6082:23323 — playable files picked: every action on. */
export const Active: Story = { args: { actions: actions('on') } };

/** Figma 6082:23363 — the pick can only be deleted, with the reason above the bar (6082:23537). */
export const DeleteOnly: Story = {
    args: { actions: actions('deleteOnly'), notice: '보관 기간이 지난 파일이 있어 삭제만 할 수 있습니다.' },
};

/** The per-action limit hint above an active bar. */
export const WithLimitNotice: Story = {
    args: { actions: actions('on'), notice: '한 번에 10개까지 저장하거나 공유할 수 있습니다.' },
};
