declare const useEffect: (effect: () => void, deps: unknown[]) => void;

// eslint-disable-next-line no-console
export const asAnyFixture = (value: unknown) => value as any;

// @ts-ignore
export const ignoredFixture: number = 'not a number';

export const useEffectFixture = () => useEffect(() => undefined, []);
