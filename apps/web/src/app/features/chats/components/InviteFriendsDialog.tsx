import { ChevronLeft, Loader2, Search, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ContactInfo } from '@chatic/app-messages';
import { isNative, webClient } from '@chatic/bridges';
import { reportError, toError } from '@chatic/web-core';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useCreateInviteBatch } from '../hooks';

import { AddFriendSheet } from './AddFriendSheet';
import { ContactListItem } from './ContactListItem';
import { PermissionDeniedBanner } from './PermissionDeniedBanner';
import { useOnGetContacts } from '../../../shared/hooks';

const inviteLogger = {
    error: (tag: string, msg: string, ...args: any[]) => console.error(`[${tag}] ${msg}`, ...args),
};

// Valid Korean mobile prefixes: 010, 011, 016, 017, 018, 019
const KOREAN_MOBILE_PREFIXES = ['010', '011', '016', '017', '018', '019'];

/** +82 국제 형식을 로컬 형식(0XX...)으로 정규화 */
const normalizeKoreanPhone = (digits: string): string => {
    if (digits.startsWith('82') && digits.length >= 12) {
        return '0' + digits.slice(2);
    }
    return digits;
};

const isValidKoreanPhone = (digits: string): boolean => {
    const normalized = normalizeKoreanPhone(digits);
    if (normalized.length < 10 || normalized.length > 11) return false;
    return KOREAN_MOBILE_PREFIXES.some(prefix => normalized.startsWith(prefix));
};

/** 연락처에서 유효한 한국 휴대폰 번호를 추출합니다. 유효하지 않으면 null을 반환합니다. */
const extractValidPhone = (contact: ContactInfo): string | null => {
    const phoneNumber = contact.phoneNumbers?.[0]?.number;
    if (!phoneNumber) return null;
    const normalized = normalizeKoreanPhone(phoneNumber.replace(/\D/g, ''));
    return isValidKoreanPhone(normalized) ? normalized : null;
};

interface InviteFriendsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    channelId?: string;
}

export const InviteFriendsDialog = ({ open, onOpenChange, channelId }: InviteFriendsDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [hasRequestedContacts, setHasRequestedContacts] = useState(false);
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [isBatchInviting, setIsBatchInviting] = useState(false);

    const isOnMobileApp = isNative();
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(false);
    const { createBatchInvite } = useCreateInviteBatch();

    // 웹: 연락처 접근 불가 → AddFriendSheet(번호 직접 입력)만 바로 노출
    if (!isOnMobileApp) {
        return <AddFriendSheet open={open ?? false} onOpenChange={v => onOpenChange?.(v)} channelId={channelId} />;
    }

    // Listen for contact response from native app
    useOnGetContacts(message => {
        setIsWaitingForContacts(false);
        const receivedContacts = message.data?.contacts ?? [];
        if (receivedContacts.length > 0) {
            setContacts(receivedContacts);
            setPermissionDenied(false);
        } else {
            setContacts([]);
            setPermissionDenied(true);
        }
    });

    // Request contacts when dialog opens (mobile only)
    useEffect(() => {
        if (open && isOnMobileApp && !hasRequestedContacts) {
            webClient.post('GetContacts', { data: {} });
            setHasRequestedContacts(true);
            setIsWaitingForContacts(true);
        }
    }, [open, isOnMobileApp, hasRequestedContacts]);

    // Timeout: If no response after 3 seconds, assume permission denied
    // (Android may take longer to fetch contacts on slower devices)
    useEffect(() => {
        if (!isWaitingForContacts) return;

        const timeoutId = setTimeout(() => {
            if (isWaitingForContacts && contacts.length === 0) {
                setIsWaitingForContacts(false);
                setPermissionDenied(true);
            }
        }, 3000);

        return () => clearTimeout(timeoutId);
    }, [isWaitingForContacts, contacts.length]);

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setSearch('');
            setHasRequestedContacts(false);
            setIsWaitingForContacts(false);
            setPermissionDenied(false);
            setContacts([]);
            setSelectedContactIds(new Set());
            setIsBatchInviting(false);
        }
    }, [open]);

    // 선택된 연락처는 필터 무관하게 항상 상단 표시, 나머지는 검색 필터 적용
    const filteredContacts = useMemo(() => {
        const selected: ContactInfo[] = [];
        const unselected: ContactInfo[] = [];

        for (const contact of contacts) {
            if (selectedContactIds.has(contact.recordID)) {
                selected.push(contact);
            } else {
                unselected.push(contact);
            }
        }

        // 미선택 항목만 검색 필터 적용
        let filteredUnselected = unselected;
        if (search.trim()) {
            const searchLower = search.toLowerCase();
            filteredUnselected = unselected.filter(contact => {
                const displayName = contact.displayName?.toLowerCase() ?? '';
                const givenName = contact.givenName?.toLowerCase() ?? '';
                const familyName = contact.familyName?.toLowerCase() ?? '';
                return (
                    displayName.includes(searchLower) ||
                    givenName.includes(searchLower) ||
                    familyName.includes(searchLower)
                );
            });
        }

        return [...selected, ...filteredUnselected];
    }, [contacts, search, selectedContactIds]);

    const handleToggle = useCallback(
        (contact: ContactInfo) => {
            if (isBatchInviting) return;
            setSelectedContactIds(prev => {
                const next = new Set(prev);
                if (next.has(contact.recordID)) {
                    next.delete(contact.recordID);
                } else {
                    next.add(contact.recordID);
                }
                return next;
            });
        },
        [isBatchInviting]
    );

    const handleBatchInvite = async () => {
        if (!channelId || selectedContactIds.size === 0 || isBatchInviting) return;

        // 선택된 연락처에서 유효한 번호 + 이름 추출
        const phones: string[] = [];
        const names: string[] = [];
        for (const contact of contacts) {
            if (!selectedContactIds.has(contact.recordID)) continue;
            const phone = extractValidPhone(contact);
            if (phone) {
                phones.push(phone);
                names.push(contact.displayName || contact.givenName || '');
            }
        }

        if (phones.length === 0) return;

        setIsBatchInviting(true);
        try {
            await createBatchInvite({ channelId, phones, names });
            toast({ title: t('inviteFriends.batchSuccess', { count: phones.length }) });
            onOpenChange?.(false);
        } catch (error) {
            inviteLogger.error('INVITE', 'Failed to batch invite contacts', { error, data: { channelId } });
            reportError(toError(error));
            const message = error instanceof Error ? error.message : t('inviteFriends.batchFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsBatchInviting(false);
        }
    };

    const showContactList = isOnMobileApp && contacts.length > 0;
    const showPermissionBanner = isOnMobileApp && permissionDenied && !isWaitingForContacts;
    const showNoResults = showContactList && search.trim() && filteredContacts.length === 0;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="m-0 w-full max-w-full rounded-none bg-background"
                    hideClose
                    variant="slide-up"
                    aria-describedby={undefined}
                >
                    <DialogDescription className="sr-only">Invite friends to this channel</DialogDescription>

                    <div className="flex h-full flex-col overflow-hidden bg-background">
                        <div className="shrink-0">
                            <div className="flex items-center justify-between px-1.5 py-3">
                                <button
                                    onClick={() => onOpenChange?.(false)}
                                    className="flex h-11 w-11 items-center justify-center"
                                >
                                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                                </button>
                                <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                                    {t('inviteFriends.title')}
                                </DialogTitle>
                                <div className="h-11 w-11" />
                            </div>

                            {showPermissionBanner && <PermissionDeniedBanner />}

                            <div className="flex items-center gap-2 px-4 pt-4">
                                {showContactList && (
                                    <div className="flex flex-1 items-center gap-[9px] rounded-full border border-border bg-muted px-[14px] py-3">
                                        <Search size={18} className="shrink-0 text-foreground" />
                                        <input
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder={t('inviteFriends.searchPlaceholder')}
                                            className="flex-1 bg-transparent text-[16px] leading-[1.19] tracking-[-0.015em] text-foreground placeholder:text-muted-foreground outline-none"
                                        />
                                    </div>
                                )}
                                <button
                                    onClick={() => setAddFriendOpen(true)}
                                    aria-label={t('inviteFriends.addFriend')}
                                    className="flex size-[46px] items-center justify-center shrink-0 rounded-full border border-border bg-card shadow-sm"
                                >
                                    <UserPlus size={20} className="text-foreground" />
                                </button>
                            </div>
                        </div>

                        {showContactList && (
                            <div className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-none px-4 pt-2">
                                {showNoResults ? (
                                    <div className="flex flex-1 items-center justify-center">
                                        <p className="text-center text-[16px] font-normal leading-[1.45] tracking-[-0.16px] text-muted-foreground">
                                            {t('inviteFriends.noSearchResults')}
                                        </p>
                                    </div>
                                ) : (
                                    filteredContacts.map(contact => {
                                        const hasValidPhone = extractValidPhone(contact) !== null;
                                        return (
                                            <ContactListItem
                                                key={contact.recordID}
                                                contact={contact}
                                                selected={selectedContactIds.has(contact.recordID)}
                                                onToggle={handleToggle}
                                                disabled={!hasValidPhone || isBatchInviting}
                                            />
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* 하단 초대 버튼 */}
                        {selectedContactIds.size > 0 && (
                            <div className="shrink-0 px-4 pt-3 pb-4">
                                <button
                                    onClick={handleBatchInvite}
                                    disabled={isBatchInviting}
                                    className="w-full rounded-full py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-center transition-colors
                                        disabled:opacity-50
                                        bg-[#B0EA10] text-[#222325]"
                                >
                                    {isBatchInviting ? (
                                        <Loader2 className="mx-auto size-5 animate-spin" />
                                    ) : (
                                        t('inviteFriends.inviteSelected', { count: selectedContactIds.size })
                                    )}
                                </button>
                            </div>
                        )}

                        <div
                            className="shrink-0 touch-none bg-background"
                            style={{
                                height: `calc( var(--keyboard-height, 0px))`,
                            }}
                            onTouchMove={e => e.preventDefault()}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <AddFriendSheet open={addFriendOpen} onOpenChange={setAddFriendOpen} channelId={channelId} />
        </>
    );
};
