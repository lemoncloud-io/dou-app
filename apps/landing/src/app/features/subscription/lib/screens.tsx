import { type JSX, type ReactNode, createContext, useContext } from 'react';

/**
 * Whether the screens that manage cards (W-12) and billing emails (W-16, and the verification step
 * W-24 before checkout) are open.
 *
 * They are shut: the cards and the emails behind them have no server of their own yet, so the screens
 * would only be answered by the mock. Shut means the routes are not registered (the paths fall to the
 * catch-all) and every link into them is gone; the port methods, the HTTP port and the mock are left as
 * they were, so opening them again is this one value and nothing else. What shutting them costs — no
 * changing or removing the card while subscribed, one address for notices — is written down beside the
 * decision, not here.
 */
export const MANAGEMENT_SCREENS_OPEN = false;

const ManagementScreensContext = createContext<boolean>(MANAGEMENT_SCREENS_OPEN);

/** Provided at the route root, so a test can open the screens without touching the value above. */
export const ManagementScreensProvider = ({ open, children }: { open: boolean; children: ReactNode }): JSX.Element => (
    <ManagementScreensContext.Provider value={open}>{children}</ManagementScreensContext.Provider>
);

/** Whether the card and billing-email screens exist, for the links and blocks that lead to them. */
export const useManagementScreens = (): boolean => useContext(ManagementScreensContext);
