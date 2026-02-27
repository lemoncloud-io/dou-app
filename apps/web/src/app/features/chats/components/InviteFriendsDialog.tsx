import { X } from 'lucide-react';
import { useState } from 'react';

import { useInviteChannel } from '../hooks/useInviteChannel';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

const decodeJWT = (token: string) => {
    try {
        if (!token || token.split('.').length !== 3) {
            return null;
        }
        const base64Url = token.split('.')[1];
        if (!base64Url) {
            return null;
        }
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (error) {
        return null;
    }
};

interface InviteFriendsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    channelId?: string;
}

export const InviteFriendsDialog = ({ open, onOpenChange, channelId }: InviteFriendsDialogProps) => {
    const [token, setToken] = useState('');
    const { inviteChannel, isPending } = useInviteChannel();
    const { toast } = useToast();

    const decodedToken = token ? decodeJWT(token) : null;
    const isValidToken = token && decodedToken !== null;
    const showInvalidMessage = token && !isValidToken;

    const handleInvite = async () => {
        if (!channelId || !isValidToken || !decodedToken?.uid) return;

        try {
            await inviteChannel(channelId, [decodedToken.uid]);
            toast({ title: '초대되었습니다' });
            setToken('');
            onOpenChange?.(false);
        } catch (error) {
            toast({ title: '초대에 실패했습니다', variant: 'destructive' });
            console.error('Failed to invite:', error);
        }
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-full w-full m-0 rounded-none" hideClose variant="fullscreen">
                <div className="flex flex-col h-full bg-white">
                    {/* Top Bar */}
                    <div className="flex items-center justify-between px-1.5 py-3 bg-white">
                        <div className="w-11 h-11" />
                        <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#222325]">
                            친구 초대
                        </h1>
                        <button
                            onClick={() => onOpenChange?.(false)}
                            className="w-11 h-11 flex items-center justify-center"
                        >
                            <X className="w-6 h-6 text-[#3A3C40]" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col gap-6 px-7 pt-6">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="token" className="text-xs font-medium text-[#9FA2A7]">
                                Identity Token
                            </Label>
                            <Input
                                id="token"
                                type="text"
                                value={token}
                                onChange={e => setToken(e.target.value)}
                                placeholder="토큰 입력"
                                className="h-11 px-3 text-base border-[#EAEAEC] rounded-[10px]"
                            />
                            {showInvalidMessage && (
                                <p className="text-xs text-destructive px-0.5">올바른 형식의 토큰이 아닙니다</p>
                            )}
                        </div>

                        {decodedToken && (
                            <div className="flex flex-col gap-2 p-3 bg-[#F4F5F5] rounded-lg">
                                <p className="text-xs font-medium text-[#9FA2A7]">디코딩된 정보</p>
                                <div className="flex flex-col gap-1 text-xs text-[#53555B]">
                                    {decodedToken.User?.name && <p>이름: {decodedToken.User.name}</p>}
                                    {decodedToken.User?.nick && <p>닉네임: {decodedToken.User.nick}</p>}
                                    {decodedToken.uid && <p>UID: {decodedToken.uid}</p>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Button */}
                    <div className="flex flex-col px-4 pb-4">
                        <Button
                            onClick={handleInvite}
                            disabled={!isValidToken || isPending}
                            className="w-full h-[50px] bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325] font-semibold text-base rounded-full disabled:opacity-50"
                        >
                            {isPending ? '초대 중...' : '초대하기'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
