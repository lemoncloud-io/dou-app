import { Camera, Image, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { InviteCodeCard, VisibilityToggle } from '../../workspace/components';
import { useCreateChannel } from '../hooks/useCreateChannel';

interface CreateRoomSuccessProps {
    name: string;
    visibility: 'public' | 'private';
    inviteCode: string;
    createdChannelId: string | null;
    onClose: () => void;
    onConfirm: () => void;
}

const CreateRoomSuccess = ({ name, visibility, inviteCode, onClose, onConfirm }: CreateRoomSuccessProps) => {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="flex items-center justify-between px-5 pb-3 pt-3">
                <div className="w-8" />
                <h1 className="text-[17px] font-semibold text-foreground">채팅방 생성 완료</h1>
                <button onClick={onClose} className="p-1">
                    <X size={22} className="text-foreground" />
                </button>
            </header>

            <div className="flex-1 space-y-6 px-5 pt-8">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
                        <span className="text-2xl">🎉</span>
                    </div>
                    <h2 className="text-xl font-bold text-foreground">"{name}" 생성 완료!</h2>
                    <p className="mt-2 text-sm text-muted-foreground">초대 코드를 공유하여 친구를 초대하세요</p>
                </div>

                <InviteCodeCard code={inviteCode} label="채팅방 초대 코드" />

                <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                        {visibility === 'public' ? '🌐 공개 채팅방' : '🔒 비공개 채팅방'}
                    </span>
                </div>
            </div>

            <div className="px-5 pb-10 pt-4">
                <button
                    onClick={onConfirm}
                    className="w-full rounded-2xl bg-accent py-4 text-[15px] font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
                >
                    확인
                </button>
            </div>
        </div>
    );
};

export const CreateRoomPage = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { createChannel, isLoading } = useCreateChannel();
    const [name, setName] = useState('');
    const [visibility, setVisibility] = useState<'public' | 'private'>('private');
    const [created, setCreated] = useState(false);
    const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);
    const inviteCode = 'ABC123'; // TODO: Get from API response

    const handleCreate = async () => {
        if (name.length === 0 || isLoading) return;

        try {
            const channel = await createChannel({
                stereo: visibility,
                name: name.trim(),
            });
            setCreatedChannelId(channel?.id ?? null);
            setCreated(true);
            toast({ title: '채팅방이 생성되었습니다' });
        } catch {
            toast({ title: '채팅방 생성에 실패했습니다', variant: 'destructive' });
        }
    };

    if (created) {
        return (
            <CreateRoomSuccess
                name={name}
                visibility={visibility}
                inviteCode={inviteCode}
                createdChannelId={createdChannelId}
                onClose={() => navigate('/')}
                onConfirm={() => {
                    if (createdChannelId) {
                        navigate(`/chats/${createdChannelId}/room`);
                    } else {
                        navigate('/');
                    }
                }}
            />
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="flex items-center justify-between px-5 pb-3 pt-3">
                <div className="w-8" />
                <h1 className="text-[17px] font-semibold text-foreground">새 채팅</h1>
                <button onClick={() => navigate(-1)} className="p-1">
                    <X size={22} className="text-foreground" />
                </button>
            </header>

            <div className="flex-1 px-5 pt-4">
                <h2 className="text-2xl font-extrabold leading-tight text-foreground">
                    친구와 채팅할 방을
                    <br />
                    설정해 주세요
                </h2>

                <div className="mt-8">
                    <label className="text-sm font-semibold text-foreground">방 이름</label>
                    <div className="relative mt-2">
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value.slice(0, 20))}
                            placeholder="예: 스터디 방"
                            className="w-full rounded-xl border border-border px-4 py-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {name.length}/20
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">20글자 이내로 입력해 주세요.</p>
                </div>

                <div className="mt-8">
                    <label className="text-sm font-semibold text-foreground">
                        방 사진 <span className="font-normal text-muted-foreground">[선택]</span>
                    </label>
                    <div className="relative mt-3 h-28 w-28">
                        <div className="flex h-full w-full items-center justify-center rounded-xl bg-muted">
                            <Image size={32} className="text-muted-foreground" />
                        </div>
                        <button className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent shadow-md">
                            <Camera size={16} className="text-accent-foreground" />
                        </button>
                    </div>
                </div>

                <div className="mt-8">
                    <label className="text-sm font-semibold text-foreground">공개 설정</label>
                    <div className="mt-2">
                        <VisibilityToggle value={visibility} onChange={setVisibility} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {visibility === 'public'
                            ? '누구나 탐색에서 찾아 참여할 수 있습니다.'
                            : '초대 코드로만 참여할 수 있습니다.'}
                    </p>
                </div>
            </div>

            <div className="px-5 pb-10 pt-4">
                <button
                    disabled={name.length === 0 || isLoading}
                    onClick={handleCreate}
                    className="w-full rounded-2xl bg-muted py-4 text-[15px] font-semibold text-muted-foreground transition-all disabled:opacity-100 enabled:bg-accent enabled:text-accent-foreground active:scale-[0.98]"
                >
                    {isLoading ? '생성 중...' : '완료'}
                </button>
            </div>
        </div>
    );
};
