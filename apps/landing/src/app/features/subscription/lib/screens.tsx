import { type JSX, type ReactNode, createContext, useContext } from 'react';

/**
 * Whether the screens that manage cards (W-12) and billing emails (W-16, and the verification step
 * W-24 before checkout) are open, each on its own.
 *
 * The cards are open: the payment service holds several per account, and the server lists them, picks
 * the default and removes one. The billing emails are shut — they have no server of their own, so the
 * screens would only be answered by the mock. Shut means the routes are not registered (the paths fall
 * to the catch-all) and every link into them is gone; the port methods, the HTTP port and the mock are
 * left as they were, so opening them again is a value here and nothing else. What keeping the emails
 * shut costs — one address for notices — is written down beside the decision, not here.
 */
export interface ManagementScreens {
    cards: boolean;
    emails: boolean;
}

export const MANAGEMENT_SCREENS_OPEN: ManagementScreens = { cards: true, emails: false };

const ManagementScreensContext = createContext<ManagementScreens>(MANAGEMENT_SCREENS_OPEN);

/**
 * Provided at the route root, so a test can open or shut the screens without touching the value
 * above. `true` or `false` opens or shuts both.
 */
export const ManagementScreensProvider = ({
    open,
    children,
}: {
    open: boolean | ManagementScreens;
    children: ReactNode;
}): JSX.Element => (
    <ManagementScreensContext.Provider value={typeof open === 'boolean' ? { cards: open, emails: open } : open}>
        {children}
    </ManagementScreensContext.Provider>
);

/** Which of the card and billing-email screens exist, for the links and blocks that lead to them. */
export const useManagementScreens = (): ManagementScreens => useContext(ManagementScreensContext);
