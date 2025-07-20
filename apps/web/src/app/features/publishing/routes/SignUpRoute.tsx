import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { SignUpPage } from '../pages/SignUpPage';

export const SignUpRoute: React.FC = () => {
    return (
        <Routes>
            <Route path="/signup" element={<SignUpPage />} />
        </Routes>
    );
};
