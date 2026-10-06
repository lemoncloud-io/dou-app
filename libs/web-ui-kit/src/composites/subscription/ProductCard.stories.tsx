import type { Meta, StoryObj } from '@storybook/react';

import { Button } from '../../foundations/button/Button';
import { PlanBadge } from '../../foundations/badge/PlanBadge';
import { IconBoltSolid } from '../../resources/icons';
import { KeyValueRows } from './KeyValueRows';
import { ProductCard } from './ProductCard';

const meta: Meta<typeof ProductCard> = {
    title: 'web-ui-kit/composites/ProductCard',
    component: ProductCard,
    decorators: [
        Story => (
            <div className="w-[375px] bg-background p-4">
                <Story />
            </div>
        ),
    ],
    args: {
        name: 'DoU Pro',
        badge: <PlanBadge label="PRO" accent icon={<IconBoltSolid className="text-foreground" />} />,
        statusLabel: 'In use',
        statusTone: 'active',
    },
};
export default meta;

type Story = StoryObj<typeof ProductCard>;

/** Active status, no caption, no body. */
export const Active: Story = {};

/** Scheduled tone with the grey caption row. */
export const ScheduledWithCaption: Story = {
    args: { statusLabel: 'Scheduled', statusTone: 'scheduled', caption: 'Starts on Oct 30, 2026' },
};

/** Ended tone. */
export const Ended: Story = { args: { statusLabel: 'Ended', statusTone: 'ended' } };

/** Danger tone with `onClick`: the header row becomes a button and a chevron trails the status. */
export const DangerClickable: Story = {
    args: { statusLabel: 'Payment failed', statusTone: 'danger', onClick: () => undefined },
};

/** Nested key/value rows and a CTA under the divider. */
export const WithChildren: Story = {
    args: {
        caption: 'Renews automatically every month',
        onClick: () => undefined,
        children: (
            <>
                <KeyValueRows
                    bare
                    rows={[
                        { label: 'Next payment', value: 'Oct 30, 2026' },
                        { label: 'Amount', value: '₩6,600', tone: 'accent', hint: '₩8,800' },
                    ]}
                />
                <div className="px-4 pb-2 pt-1">
                    <Button fullWidth>Change plan</Button>
                </div>
            </>
        ),
    },
};
