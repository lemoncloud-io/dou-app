import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import type { JSX } from 'react';

export const LoginPage = (): JSX.Element => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [token, setToken] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const canSubmit = token.length > 0 && !isLoading;

    const handleLogin = async () => {
        // TODO: Implement login logic
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && canSubmit) {
            handleLogin();
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-white p-4">
            <div className="w-full max-w-md space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="token">Token</Label>
                    <Input
                        id="token"
                        type="text"
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isLoading}
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        className="font-mono text-sm"
                    />
                </div>
                <Button onClick={handleLogin} disabled={!canSubmit} className="w-full">
                    {isLoading ? 'Connecting...' : 'Connect'}
                </Button>
            </div>
        </div>
    );
};
