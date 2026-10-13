import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

type Row = { id: string; isOwner?: boolean };

let mockCid = 'cloud-a';
let mockSelected: string | null = 'p1';
let mockPlaces: Row[] = [];
let mockLoading = false;
const isPlaceDeleted = jest.fn((_id: string) => Promise.resolve(true));
const logoutCloudSession = jest.fn(() => Promise.resolve());
const navigate = jest.fn();
const repositories = { place: { isPlaceDeleted } };

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: { useSessionSelection: () => ({ selectedSiteId: mockSelected }) },
    },
}));
jest.mock('../../../hooks', () => ({
    useActiveCloudPlaces: () => ({ places: mockPlaces, isLoading: mockLoading }),
    useSelectedCloudId: () => mockCid,
}));
jest.mock('../../../runtime/useLogoutCloudSession', () => ({ useLogoutCloudSession: () => ({ logoutCloudSession }) }));

import { PlaceDeletedNotice } from './PlaceDeletedNotice';

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

/** Renders with the selected place in the list, then takes it out — the way a refresh drops it. */
const dropSelectedPlace = async (selected: Row) => {
    mockPlaces = [selected, { id: 'other' }];
    const view = render(<PlaceDeletedNotice />);
    mockPlaces = [{ id: 'other' }];
    view.rerender(<PlaceDeletedNotice />);
    await settle();
    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockCid = 'cloud-a';
    mockSelected = 'p1';
    mockPlaces = [];
    mockLoading = false;
    isPlaceDeleted.mockResolvedValue(true);
});

describe('PlaceDeletedNotice', () => {
    it('tells a member their place was deleted once the server confirms it, and takes them to DoU Home', async () => {
        await dropSelectedPlace({ id: 'p1', isOwner: false });

        expect(isPlaceDeleted).toHaveBeenCalledWith('p1');
        expect(screen.getByText('placeDeleted.title')).toBeInTheDocument();
        expect(screen.getByText('placeDeleted.description')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByText('common.confirm'));
        });
        expect(logoutCloudSession).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('says nothing when the place is still there — the member was removed or left', async () => {
        isPlaceDeleted.mockResolvedValue(false);

        await dropSelectedPlace({ id: 'p1', isOwner: false });

        expect(isPlaceDeleted).toHaveBeenCalledWith('p1');
        expect(screen.queryByText('placeDeleted.title')).not.toBeInTheDocument();
    });

    it('says nothing when the server cannot be asked', async () => {
        isPlaceDeleted.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));

        await dropSelectedPlace({ id: 'p1', isOwner: false });

        expect(screen.queryByText('placeDeleted.title')).not.toBeInTheDocument();
    });

    it('does not ask about a place the user owned — they deleted it themselves', async () => {
        await dropSelectedPlace({ id: 'p1', isOwner: true });

        expect(isPlaceDeleted).not.toHaveBeenCalled();
        expect(screen.queryByText('placeDeleted.title')).not.toBeInTheDocument();
    });

    it('does not take a cloud switch for a deleted place', async () => {
        mockPlaces = [{ id: 'p1' }];
        const view = render(<PlaceDeletedNotice />);
        mockCid = 'cloud-b';
        mockSelected = 'q1';
        mockPlaces = [{ id: 'q1' }];
        view.rerender(<PlaceDeletedNotice />);
        await settle();

        expect(isPlaceDeleted).not.toHaveBeenCalled();
    });

    it('waits while the list is still loading, and asks once per place', async () => {
        mockPlaces = [{ id: 'p1' }];
        const view = render(<PlaceDeletedNotice />);
        mockPlaces = [];
        mockLoading = true;
        view.rerender(<PlaceDeletedNotice />);
        await settle();
        expect(isPlaceDeleted).not.toHaveBeenCalled();

        mockLoading = false;
        mockPlaces = [{ id: 'other' }];
        view.rerender(<PlaceDeletedNotice />);
        await settle();
        view.rerender(<PlaceDeletedNotice />);
        await settle();
        expect(isPlaceDeleted).toHaveBeenCalledTimes(1);
    });

    it('stays out of the relay', async () => {
        mockCid = 'default';
        mockSelected = '0000';
        mockPlaces = [{ id: '0000' }];
        const view = render(<PlaceDeletedNotice />);
        mockPlaces = [];
        view.rerender(<PlaceDeletedNotice />);
        await settle();

        expect(isPlaceDeleted).not.toHaveBeenCalled();
    });
});
