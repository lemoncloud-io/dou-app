import { clearSiteSelection } from './clearSiteSelection';

const mockSetSelectedSiteId = jest.fn();
const mockSwitchSite = jest.fn();

jest.mock('@chatic/session/store', () => ({
    setSelectedSiteId: (...args: unknown[]) => mockSetSelectedSiteId(...args),
}));
jest.mock('../socket/switchSite', () => ({
    switchSite: (...args: unknown[]) => mockSwitchSite(...args),
}));

describe('clearSiteSelection', () => {
    it('empties the selection through the store and asks for no switch', () => {
        clearSiteSelection();

        expect(mockSetSelectedSiteId).toHaveBeenCalledTimes(1);
        expect(mockSetSelectedSiteId).toHaveBeenCalledWith(null);
        expect(mockSwitchSite).not.toHaveBeenCalled();
    });
});
