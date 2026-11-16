import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { PlaceChip } from './PlaceChip';

const meta: Meta<typeof PlaceChip> = {
    title: 'web-ui-kit/foundations/PlaceChip',
    component: PlaceChip,
};
export default meta;

type Story = StoryObj<typeof PlaceChip>;

const PLACES = [
    { id: 'family', name: '가족 모임', unread: 2 },
    { id: 'sunny', name: 'Sunny Place', unread: 22 },
    { id: 'dev', name: '개발 소통', unread: 5 },
    { id: 'quiet', name: '조용한 방', unread: 0 },
];

/** The home's place row — horizontally scrolling, the current place filled. */
const Row = () => {
    const [current, setCurrent] = useState('family');
    return (
        <div className="flex w-[375px] gap-2 overflow-x-auto px-4 py-2">
            {PLACES.map(place => (
                <PlaceChip
                    key={place.id}
                    name={place.name}
                    unread={place.unread}
                    selected={place.id === current}
                    onClick={() => setCurrent(place.id)}
                />
            ))}
        </div>
    );
};

export const PlaceRow: Story = { render: () => <Row /> };
