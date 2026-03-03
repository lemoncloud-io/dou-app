/**
 * Firebase Authentication Hook
 *
 * Manages Firebase auth state with email/password login.
 */

import { useState, useEffect, useCallback } from 'react';

import { firebaseService } from '../services';

import type { FirebaseAuthState } from '../types';

/**
 * Hook for Firebase authentication
 */
export const useFirebaseAuth = () => {
    const [state, setState] = useState<FirebaseAuthState>({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        error: null,
    });

    // Initialize Firebase and listen to auth state
    useEffect(() => {
        firebaseService.initialize();

        const unsubscribe = firebaseService.onAuthStateChanged(user => {
            setState({
                isAuthenticated: user !== null,
                isLoading: false,
                user: user
                    ? {
                          email: user.email,
                          uid: user.uid,
                      }
                    : null,
                error: null,
            });
        });

        return () => unsubscribe();
    }, []);

    /**
     * Sign in with email and password
     */
    const signIn = useCallback(async (email: string, password: string) => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            await firebaseService.signIn(email, password);
            // State will be updated by onAuthStateChanged
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed';
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: message,
            }));
            throw error;
        }
    }, []);

    /**
     * Sign out
     */
    const signOut = useCallback(async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            await firebaseService.signOut();
            // State will be updated by onAuthStateChanged
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Logout failed';
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: message,
            }));
            throw error;
        }
    }, []);

    /**
     * Clear error
     */
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    return {
        ...state,
        signIn,
        signOut,
        clearError,
    };
};
