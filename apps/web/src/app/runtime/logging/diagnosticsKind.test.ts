import type * as DiagnosticsKindModule from './diagnosticsKind';

let mockPublished: 'app' | 'page' | null = null;
const mockResolve = jest.fn<'app' | 'page', []>();

jest.mock('@chatic/host', () => ({
    host: {
        get isPublished() {
            return mockPublished !== null;
        },
        get ports() {
            if (mockPublished === null) throw new Error('[host] the ports are read before publish');
            return { diagnostics: { kind: mockPublished } };
        },
    },
    resolveDiagnosticsMethod: () => mockResolve(),
}));

/** A fresh copy of the module for each test, so the answer it read before the publish starts unset. */
const load = (): typeof DiagnosticsKindModule => {
    let loaded: typeof DiagnosticsKindModule | undefined;
    jest.isolateModules(() => {
        loaded = jest.requireActual<typeof DiagnosticsKindModule>('./diagnosticsKind');
    });
    return loaded as typeof DiagnosticsKindModule;
};

beforeEach(() => {
    mockPublished = null;
    mockResolve.mockReset();
});

describe('diagnosticsKind', () => {
    it('answers what the published diagnostics port says', () => {
        const { diagnosticsKind } = load();
        mockPublished = 'app';

        expect(diagnosticsKind()).toBe('app');
        expect(mockResolve).not.toHaveBeenCalled();
    });

    it('answers from the resolver the entry point publishes from while logging runs ahead of the publish', () => {
        const { diagnosticsKind } = load();
        mockResolve.mockReturnValue('app');

        expect(diagnosticsKind()).toBe('app');
        expect(diagnosticsKind()).toBe('app');
        expect(mockResolve).toHaveBeenCalledTimes(1);
    });

    it('switches to the published port once the entry point publishes', () => {
        const { diagnosticsKind } = load();
        mockResolve.mockReturnValue('app');
        expect(diagnosticsKind()).toBe('app');

        mockPublished = 'page';

        expect(diagnosticsKind()).toBe('page');
    });

    it('answers page to a log entry stamped while the resolver warns, instead of resolving again', () => {
        const { diagnosticsKind } = load();
        const nested: Array<'app' | 'page'> = [];
        mockResolve.mockImplementation(() => {
            // The resolver's warning is a log entry, and stamping it reads this again.
            nested.push(diagnosticsKind());
            return 'page';
        });

        expect(diagnosticsKind()).toBe('page');
        expect(nested).toEqual(['page']);
        expect(mockResolve).toHaveBeenCalledTimes(1);
    });
});
