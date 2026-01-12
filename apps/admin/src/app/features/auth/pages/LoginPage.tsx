import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { calcTestSignature } from '@lemoncloud/lemon-web-core';
import { Shield } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@chatic/ui-kit/components/ui/card';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { snsTestLogin, useWebCoreStore } from '@chatic/web-core';

export const LoginPage = (): JSX.Element => {
    const navigate = useNavigate();
    const setIsAuthenticated = useWebCoreStore(state => state.setIsAuthenticated);

    const [snsTestUid, setSnsTestUid] = useState('test');
    const [isLoading, setIsLoading] = useState(false);

    const onClickSnsTestLogin = async () => {
        const date = new Date();
        const body = {
            provider: 'test',
            idToken: snsTestUid,
            refreshToken: date.toISOString(),
            signature: calcTestSignature(
                {
                    authId: snsTestUid,
                    accountId: snsTestUid,
                    identityId: snsTestUid,
                    identityToken: '*jjukkumi-test-token-250211*',
                },
                date.toISOString()
            ),
        };

        setIsLoading(true);
        try {
            await snsTestLogin(body);
            setIsAuthenticated(true);
            navigate('/', { replace: true });
            toast.success('Login successful');
        } catch (error) {
            console.error('SNS Test Login failed:', error);
            toast.error('Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
                        <Shield className="w-8 h-8 text-primary-foreground" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl">Admin Portal</CardTitle>
                        <CardDescription>Sign in to admin dashboard</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="testUid">Test User ID</Label>
                        <Input
                            id="testUid"
                            type="text"
                            placeholder="Enter test user ID"
                            value={snsTestUid}
                            onChange={e => setSnsTestUid(e.target.value)}
                        />
                    </div>
                    <Button className="w-full" onClick={onClickSnsTestLogin} disabled={isLoading || !snsTestUid}>
                        {isLoading ? 'Signing in...' : 'Test Login'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
