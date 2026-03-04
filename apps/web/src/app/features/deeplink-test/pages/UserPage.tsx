/**
 * User Deeplink Page
 *
 * Displays user deeplink data fetched from Firebase.
 * Used for testing the deeplink flow.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { fetchUserDeeplink } from '../services';

import type { JSX } from 'react';
import type { UserDeeplinkData } from '../types';

export const UserPage = (): JSX.Element => {
    const { userId } = useParams<{ userId: string }>();
    const [data, setData] = useState<UserDeeplinkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setError('userId is required');
            setLoading(false);
            return;
        }

        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);

                const result = await fetchUserDeeplink(userId);

                if (!result) {
                    setError(`User not found: ${userId}`);
                } else {
                    setData(result);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        void loadData();
    }, [userId]);

    // Loading state
    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
                    <p className="mt-2 text-sm text-gray-600">Loading user data...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center p-6 bg-red-50 rounded-lg max-w-md">
                    <div className="text-red-600 text-lg font-semibold mb-2">Error</div>
                    <p className="text-red-700">{error}</p>
                </div>
            </div>
        );
    }

    // Data state
    return (
        <div className="h-full overflow-auto">
            <div className="max-w-2xl mx-auto p-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold">Deeplink Test - User</h1>
                    <p className="text-sm text-gray-500 mt-1">User ID: {userId}</p>
                </div>

                {/* User Info Card */}
                {data && (
                    <div className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
                        {/* User Name */}
                        <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">User Name</div>
                            <div className="text-xl font-semibold mt-1">{data.invite.user$?.name ?? 'N/A'}</div>
                        </div>

                        {/* User ID */}
                        <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">User ID</div>
                            <div className="font-mono text-sm mt-1">{data.invite.userId}</div>
                        </div>

                        {/* Deep Link URL */}
                        <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Deep Link URL</div>
                            <div className="font-mono text-sm mt-1 break-all text-blue-600">{data.deepLinkUrl}</div>
                        </div>

                        {/* Created Info */}
                        <div className="pt-4 border-t">
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>Created by: {data.createdBy}</span>
                                <span>{new Date(data.createdAt).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Raw JSON (Debug) */}
                        <div className="pt-4 border-t">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Raw Data (Debug)</div>
                            <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-60 font-mono">
                                {JSON.stringify(data, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
