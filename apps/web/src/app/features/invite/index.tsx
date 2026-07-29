import { Route, Routes } from 'react-router-dom';

import { ContactInvitePage, InviteWaitingPage } from './pages';

/** Relay 1:1 invite sender flow (ADR-0033 Track B), mounted at `/invite/*` — see routes/paths.ts. */
export const InviteRoutes = () => {
    return (
        <Routes>
            <Route path="contact" element={<ContactInvitePage />} />
            <Route path=":inviteId/waiting" element={<InviteWaitingPage />} />
        </Routes>
    );
};
