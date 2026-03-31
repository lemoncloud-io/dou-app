/**
 * Firebase Authentication Hook
 *
 * Manages Firebase auth state with anonymous authentication.
 * Auto signs in anonymously on mount.
 */

import { useState, useEffect } from 'react';

import { firebaseService } from '../services';

import type { FirebaseAuthState } from '../types';

/**
 * Hook for Firebase authentication
 * Automatically signs in anonymously on mount
 */
export const useFirebaseAuth = () => {
    const [state, setState] = useState<FirebaseAuthState>({
        isAuthenticated: false,
        isAnonymous: false,
        isLoading: true,
        user: null,
        error: null,
    });

    useEffect(() => {
        firebaseService.initialize();

        const unsubscribe = firebaseService.onAuthStateChanged(user => {
            if (user) {
                setState({
                    isAuthenticated: true,
                    isAnonymous: user.isAnonymous,
                    isLoading: false,
                    user: { email: user.email, uid: user.uid },
                    error: null,
                });
            } else {
                firebaseService.signInAnonymously().catch(error => {
                    const message = error instanceof Error ? error.message : 'Anonymous auth failed';
                    setState({
                        isAuthenticated: false,
                        isAnonymous: false,
                        isLoading: false,
                        user: null,
                        error: message,
                    });
                });
            }
        });

        return () => unsubscribe();
    }, []);

    return state;
};
