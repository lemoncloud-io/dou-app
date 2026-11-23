import { Route, Routes } from 'react-router-dom';

import { ContactInvitePage, InviteWaitingPage, PlaceInviteLinkPage, PlaceInvitePage } from './pages';

export const InviteRoutes = () => {
    return (
        <Routes>
            <Route path="contact" element={<ContactInvitePage />} />
            <Route path="place/:placeId" element={<PlaceInvitePage />} />
            <Route path="place/:placeId/link" element={<PlaceInviteLinkPage />} />
            <Route path=":inviteId/waiting" element={<InviteWaitingPage />} />
        </Routes>
    );
};
