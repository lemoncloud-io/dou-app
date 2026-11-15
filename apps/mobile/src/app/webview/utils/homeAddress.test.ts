import { homeAddress } from './homeAddress';

describe('homeAddress', () => {
    it.each([
        ['https://app.example/', 'logout=1&reason=logout', 'https://app.example/?logout=1&reason=logout'],
        ['https://app.example/', '?logout=1', 'https://app.example/?logout=1'],
        ['http://127.0.0.1:8890/?v=2', 'logout=1', 'http://127.0.0.1:8890/?v=2&logout=1'],
        ['https://app.example/', null, 'https://app.example/'],
        ['https://app.example/', '', 'https://app.example/'],
        ['', 'logout=1', ''],
    ])('%p + %p → %p', (base, search, address) => {
        expect(homeAddress(base, search)).toBe(address);
    });
});
