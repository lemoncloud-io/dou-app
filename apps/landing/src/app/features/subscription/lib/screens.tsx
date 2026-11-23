import { type JSX, type ReactNode, createContext, useContext } from 'react';

export interface ManagementScreens {
    cards: boolean;
    emails: boolean;
}

export const MANAGEMENT_SCREENS_OPEN: ManagementScreens = { cards: true, emails: false };

const ManagementScreensContext = createContext<ManagementScreens>(MANAGEMENT_SCREENS_OPEN);

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

export const useManagementScreens = (): ManagementScreens => useContext(ManagementScreensContext);
