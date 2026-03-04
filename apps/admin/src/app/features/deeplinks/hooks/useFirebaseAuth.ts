/**
 * Firebase Authentication Hook
 *
 * Manages Firebase auth state with anonymous authentication.
 * Auto signs in anonymously on mount for specified environment.
 */

import { useState, useEffect } from 'react';

import { firebaseService } from '../services';

import type { FirebaseAuthState, DeeplinkEnvironment } from '../types';

/**
 * Hook for Firebase authentication
 * Automatically signs in anonymously on mount for the specified environment
 */
export const useFirebaseAuth = (env: DeeplinkEnvironment) => {
    const [state, setState] = useState<FirebaseAuthState>({
        isAuthenticated: false,
        isAnonymous: false,
        isLoading: true,
        user: null,
        error: null,
    });

    // Initialize Firebase and auto sign-in anonymously
    useEffect(() => {
        firebaseService.initializeForEnv(env);

        const unsubscribe = firebaseService.onAuthStateChanged(env, user => {
            if (user) {
                setState({
                    isAuthenticated: true,
                    isAnonymous: user.isAnonymous,
                    isLoading: false,
                    user: {
                        email: user.email,
                        uid: user.uid,
                    },
                    error: null,
                });
            } else {
                // No user - trigger anonymous sign in
                firebaseService
                    .signInAnonymously(env)
                    .then(() => {
                        // State will be updated by onAuthStateChanged
                    })
                    .catch(error => {
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
    }, [env]);

    return state;
};
