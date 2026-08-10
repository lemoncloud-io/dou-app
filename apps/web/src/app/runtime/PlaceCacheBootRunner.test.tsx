import '@testing-library/jest-dom';

import { render } from '@testing-library/react';

import { PlaceCacheBootRunner } from './PlaceCacheBootRunner';

const cacheClear = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => ({ place: { cacheClear } }),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('PlaceCacheBootRunner', () => {
    it('clears the place cache once on mount', () => {
        cacheClear.mockResolvedValue(undefined);
        render(<PlaceCacheBootRunner />);

        expect(cacheClear).toHaveBeenCalledTimes(1);
    });

    it('does not re-clear on a re-render', () => {
        cacheClear.mockResolvedValue(undefined);
        const { rerender } = render(<PlaceCacheBootRunner />);

        rerender(<PlaceCacheBootRunner />);

        expect(cacheClear).toHaveBeenCalledTimes(1);
    });

    it('renders nothing', () => {
        cacheClear.mockResolvedValue(undefined);
        const { container } = render(<PlaceCacheBootRunner />);

        expect(container).toBeEmptyDOMElement();
    });

    it('swallows a failed clear without throwing', async () => {
        cacheClear.mockRejectedValue(new Error('boom'));

        expect(() => render(<PlaceCacheBootRunner />)).not.toThrow();
    });
});
