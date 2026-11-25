import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DomainChannel } from '@chatic/runtime-react';

import { useQuickSwitcherStore } from '../stores';
import { QuickSwitcher } from './QuickSwitcher';

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        session: { useSessionIdentity: () => ({ userId: 'me' }) },
    })
);
vi.mock('../../../shared/hooks/useAuthorNames', () => ({
    useAuthorNames: () => new Map([['u-lemon', '레몽']]),
}));
vi.mock('../../../shared/hooks/useSiteProfiles', () => ({ useSiteProfileMap: () => ({}) }));

import '../../../../i18n';

const openSwitcher = () =>
    act(() => {
        useQuickSwitcherStore.getState().setOpen(true);
    });

const local = Array.from({ length: 10 }, (_, i) => ({ id: `C${i}`, name: `design-${i}` }) as DomainChannel);
const elsewhere = [
    { channelId: 'X1', name: 'design-review', placeId: 'P2', placeName: 'Studio' },
    { channelId: 'X2', name: 'design-ops', placeId: 'P3', placeName: 'Ops' },
];

describe('QuickSwitcher', () => {
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

    it('finds a DM by the name its row shows', () => {
        const dm = { id: 'D1', stereo: 'dm', name: '1000002@1000192', memberIds: ['me', 'u-lemon'] } as DomainChannel;
        render(<QuickSwitcher channels={[...local, dm]} onSelect={vi.fn()} />);
        openSwitcher();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: '레몽' } });

        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]?.textContent).toBe('레몽');
    });

    it('prints a channel name typed with a hash once', () => {
        render(<QuickSwitcher channels={[{ id: 'H1', name: '#1' } as DomainChannel]} onSelect={vi.fn()} />);
        openSwitcher();

        expect(screen.getByRole('option').textContent).toBe('1');
    });
});
