import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import type { DomainCloud } from '@chatic/data';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, o?: { owner?: string }) => (o?.owner ? `${k}:${o.owner}` : k),
    }),
}));

import { InviteCloudItem } from './InviteCloudItem';

const CID = 'c0a1b2c3d4e5f6';

const renderItem = (inviteCloud: DomainCloud) =>
    render(
        <InviteCloudItem inviteCloud={inviteCloud} isSelected={false} isDisabled={false} onSelectCloud={jest.fn()} />
    );

describe('InviteCloudItem — row label', () => {
    it('shows the cloud name with the owner caption under it', () => {
        renderItem({ id: CID, cid: CID, name: 'Lemon Cloud', owner$: { id: 'u1', name: 'sunny' } } as DomainCloud);

        expect(screen.getByText('Lemon Cloud')).toBeInTheDocument();
        expect(screen.getByText('cloudSessionSheet.invitedOwnerLabel:sunny')).toBeInTheDocument();
    });

    it('titles a nameless cloud with the owner label instead of its cid, with no caption', () => {
        renderItem({ id: CID, cid: CID, owner$: { id: 'u1', name: 'sunny' } } as DomainCloud);

        expect(screen.queryByText(CID)).not.toBeInTheDocument();
        expect(screen.getAllByText('cloudSessionSheet.invitedOwnerLabel:sunny')).toHaveLength(1);
    });

    it('falls back to the generic invited label when neither name nor owner is known', () => {
        renderItem({ id: CID, cid: CID, name: '  ' } as DomainCloud);

        expect(screen.queryByText(CID)).not.toBeInTheDocument();
        expect(screen.getAllByText('cloudSessionSheet.invitedFallbackLabel')).toHaveLength(1);
    });
});
