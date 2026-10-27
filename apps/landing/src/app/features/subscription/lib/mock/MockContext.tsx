import { type JSX, type ReactNode, createContext, useContext, useSyncExternalStore } from 'react';

import type { MockController } from './createMockPort';
import type { MockState } from './state';

const MockContext = createContext<MockController | null>(null);

/** Provided only when the port in use is the mock — the dev panel and stand-in pages read it. */
export const MockControllerProvider = ({
    controller,
    children,
}: {
    controller: MockController | undefined;
    children: ReactNode;
}): JSX.Element => <MockContext.Provider value={controller ?? null}>{children}</MockContext.Provider>;

export const useMockController = (): MockController | null => useContext(MockContext);

/** The mock's state, re-rendering on every change. */
export const useMockState = (controller: MockController): MockState =>
    useSyncExternalStore(controller.subscribe, controller.peek);
