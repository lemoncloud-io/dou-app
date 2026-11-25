import { render } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';

import { useCloudSelfChannels } from '../features/channels/hooks';
import { useChatSyncRegistration } from '../hooks/useChatSyncRegistration';
import { useHomeChannels } from '../hooks/useHomeChannels';
import { ChatSyncRunner } from './ChatSyncRunner';

jest.mock('@chatic/runtime-react', () => ({
    runtime: { session: { useSessionSelection: jest.fn(), useUidInCloud: jest.fn() } },
}));
jest.mock('../hooks/useChatSyncRegistration', () => ({ useChatSyncRegistration: jest.fn() }));
jest.mock('../hooks/useHomeChannels', () => ({ useHomeChannels: jest.fn() }));
jest.mock('../features/channels/hooks', () => ({ useCloudSelfChannels: jest.fn() }));
jest.mock('../hooks/useCloudScope', () => ({ useSelectedCloudId: () => 'cloud-a' }));

describe('ChatSyncRunner', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: '10001' });
        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('1001002');
    });

    it("registers the chat sync for the session place's rooms and the cloud's notes-to-self room", () => {
        (useHomeChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'c1' }, { id: 'c2' }], isLoading: false });
        (useCloudSelfChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'self' }], isLoading: false });

        const { container } = render(<ChatSyncRunner />);

        expect(useHomeChannels).toHaveBeenCalledWith('10001');
        expect(useChatSyncRegistration).toHaveBeenCalledWith([{ id: 'c1' }, { id: 'c2' }, { id: 'self' }]);
        expect(container.innerHTML).toBe('');
    });

    it('passes the notes-to-self room once when the place slice already holds it', () => {
        (useHomeChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'c1' }, { id: 'self' }], isLoading: false });
        (useCloudSelfChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'self' }], isLoading: false });

        render(<ChatSyncRunner />);

        expect(useChatSyncRegistration).toHaveBeenCalledWith([{ id: 'c1' }, { id: 'self' }]);
    });

    it("leaves out somebody else's notes-to-self room, from either slice", () => {
        const foreign = { id: 'U:1000124', stereo: 'self', ownerId: '1000124' };
        const mine = { id: 'U:1001002', stereo: 'self', ownerId: '1001002' };
        (useHomeChannels as jest.Mock).mockReturnValue({ channels: [{ id: 'c1' }, foreign], isLoading: false });
        (useCloudSelfChannels as jest.Mock).mockReturnValue({ channels: [foreign, mine], isLoading: false });

        render(<ChatSyncRunner />);

        expect(runtime.session.useUidInCloud).toHaveBeenCalledWith('cloud-a');
        expect(useChatSyncRegistration).toHaveBeenCalledWith([{ id: 'c1' }, mine]);
    });

    it('keeps a notes-to-self room while the owner or the session uid is still unknown', () => {
        const ownerless = { id: 'U:1000124', stereo: 'self' };
        (useHomeChannels as jest.Mock).mockReturnValue({ channels: [], isLoading: false });
        (useCloudSelfChannels as jest.Mock).mockReturnValue({ channels: [ownerless], isLoading: false });

        const { rerender } = render(<ChatSyncRunner />);
        expect(useChatSyncRegistration).toHaveBeenLastCalledWith([ownerless]);

        const owned = { id: 'U:1000124', stereo: 'self', ownerId: '1000124' };
        (useCloudSelfChannels as jest.Mock).mockReturnValue({ channels: [owned], isLoading: false });
        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue(null);

        rerender(<ChatSyncRunner />);
        expect(useChatSyncRegistration).toHaveBeenLastCalledWith([owned]);
    });
});
