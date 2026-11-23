import type * as DiagnosticsKindModule from './diagnosticsKind';

let mockPublished: 'shell' | 'browser' | null = null;
const mockResolve = jest.fn<'shell' | 'browser', []>();

jest.mock('@chatic/runtime-web', () => ({
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
        mockPublished = 'shell';

        expect(diagnosticsKind()).toBe('shell');
        expect(mockResolve).not.toHaveBeenCalled();
    });

    it('answers from the resolver the entry point publishes from while logging runs ahead of the publish', () => {
        const { diagnosticsKind } = load();
        mockResolve.mockReturnValue('shell');

        expect(diagnosticsKind()).toBe('shell');
        expect(diagnosticsKind()).toBe('shell');
        expect(mockResolve).toHaveBeenCalledTimes(1);
    });

    it('switches to the published port once the entry point publishes', () => {
        const { diagnosticsKind } = load();
        mockResolve.mockReturnValue('shell');
        expect(diagnosticsKind()).toBe('shell');

        mockPublished = 'browser';

        expect(diagnosticsKind()).toBe('browser');
    });

    it('answers browser to a log entry stamped while the resolver warns, instead of resolving again', () => {
        const { diagnosticsKind } = load();
        const nested: Array<'shell' | 'browser'> = [];
        mockResolve.mockImplementation(() => {
            nested.push(diagnosticsKind());
            return 'browser';
        });

        expect(diagnosticsKind()).toBe('browser');
        expect(nested).toEqual(['browser']);
        expect(mockResolve).toHaveBeenCalledTimes(1);
    });
});
