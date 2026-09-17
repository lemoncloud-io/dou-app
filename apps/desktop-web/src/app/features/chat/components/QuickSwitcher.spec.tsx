import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { QuickSwitcher } from './QuickSwitcher';

// Initialises i18next so the placeholder label resolves.
import '../../../../i18n';

const local = Array.from({ length: 10 }, (_, i) => ({ id: `C${i}`, name: `design-${i}` }) as DomainChannel);
const elsewhere = [
    { channelId: 'X1', name: 'design-review', placeId: 'P2', placeName: 'Studio' },
    { channelId: 'X2', name: 'design-ops', placeId: 'P3', placeName: 'Ops' },
];

describe('QuickSwitcher', () => {
    // A common word used to fill all eight rows with this place and hide the others.
    it('keeps rows for other places when this place alone could fill the list', () => {
        const onSelectElsewhere = vi.fn();
        render(
            <QuickSwitcher
                channels={local}
                onSelect={vi.fn()}
                elsewhere={elsewhere}
                onSelectElsewhere={onSelectElsewhere}
            />
        );
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'design' } });

        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(8);
        fireEvent.click(options[7] as HTMLElement);
        expect(onSelectElsewhere).toHaveBeenCalledWith('X2', 'P3');
    });
});
