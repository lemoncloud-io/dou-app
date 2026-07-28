import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import type { ContactInfo } from '@chatic/app-messages';
import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { Button, IconLink, SearchInput, SelectableUserItem, SelectedAvatarRow } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { PageHeader } from '../../../ui/components';
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { toError } from '../../../utils/errors';
import { useCreateInviteBatch } from '../hooks';
import { AddFriendSheet } from '../components/AddFriendSheet';
import { PermissionDeniedBanner } from '../components/PermissionDeniedBanner';

/** A single invite batch selects at most this many friends. */
const MAX_INVITE_SELECTION = 100;

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

const contactName = (contact: ContactInfo): string => contact.displayName || contact.givenName || '';

/**
 * 채널 친구 초대 페이지 — 기존 InviteFriendsDialog를 라우팅 페이지로 전환한 것.
 * 네이티브: 디바이스 연락처를 다중 선택해 일괄 초대. 웹: 연락처 접근 불가 → 초대 링크 흐름으로 유도.
 */
export const InvitePage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();

    const isOnMobileApp = isNative();
    const [search, setSearch] = useState('');
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(isOnMobileApp);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchInviting, setIsBatchInviting] = useState(false);

    const { createSingleInvite, createBatchInvite } = useCreateInviteBatch();

    // 네이티브에서만 연락처를 불러온다. 웹은 연락처 접근 불가 → 초대 링크 유도.
    useEffect(() => {
        if (!isOnMobileApp) return;
        let cancelled = false;
        setIsWaitingForContacts(true);
        appBridge
            .getContacts()
            .then(response => {
                if (cancelled) return;
                const received = response.data?.contacts ?? [];
                setIsWaitingForContacts(false);
                if (received.length > 0) {
                    setContacts(received);
                    setPermissionDenied(false);
                } else {
                    setPermissionDenied(true);
                }
            })
            .catch(() => {
                if (cancelled) return;
                setIsWaitingForContacts(false);
                setPermissionDenied(true);
            });
        return () => {
            cancelled = true;
        };
    }, [isOnMobileApp]);

    // 선택된 연락처는 필터 무관하게 상단, 나머지는 검색 필터 적용.
    const filteredContacts = useMemo(() => {
        const selected: ContactInfo[] = [];
        const unselected: ContactInfo[] = [];
        for (const contact of contacts) {
            (selectedIds.has(contact.recordID) ? selected : unselected).push(contact);
        }
        let rest = unselected;
        if (search.trim()) {
            const q = search.toLowerCase();
            rest = unselected.filter(c =>
                [c.displayName, c.givenName, c.familyName].some(n => n?.toLowerCase().includes(q))
            );
        }
        return [...selected, ...rest];
    }, [contacts, search, selectedIds]);

    const selectedItems = useMemo(
        () => contacts.filter(c => selectedIds.has(c.recordID)).map(c => ({ id: c.recordID, name: contactName(c) })),
        [contacts, selectedIds]
    );

    const handleToggle = useCallback(
        (contact: ContactInfo, next: boolean) => {
            if (isBatchInviting) return;
            setSelectedIds(prev => {
                if (next && prev.size >= MAX_INVITE_SELECTION && !prev.has(contact.recordID)) {
                    toast({ title: t('inviteFriends.limitToast', { max: MAX_INVITE_SELECTION }) });
                    return prev;
                }
                const updated = new Set(prev);
                if (next) {
                    updated.add(contact.recordID);
                } else {
                    updated.delete(contact.recordID);
                }
                return updated;
            });
        },
        [isBatchInviting, toast, t]
    );

    const removeSelected = useCallback((id: string) => {
        setSelectedIds(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
        });
    }, []);

    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

    const handleBatchInvite = async () => {
        if (!channelId || selectedIds.size === 0 || isBatchInviting) return;

        const recipients: { name: string; phone: string }[] = [];
        for (const contact of contacts) {
            if (!selectedIds.has(contact.recordID)) continue;
            const phone = extractValidPhone(contact);
            if (phone) recipients.push({ name: contactName(contact), phone });
        }
        if (recipients.length === 0) return;

        setIsBatchInviting(true);
        try {
            if (recipients.length === 1) {
                await createSingleInvite({ channelId, name: recipients[0].name, phone: recipients[0].phone });
            } else {
                await createBatchInvite({
                    channelId,
                    phones: recipients.map(r => r.phone),
                    names: recipients.map(r => r.name),
                });
            }
            toast({ title: t('inviteFriends.batchSuccess', { count: recipients.length }) });
            navigate(-1);
        } catch (error) {
            reportError(toError(error));
            const message = error instanceof Error ? error.message : t('inviteFriends.batchFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsBatchInviting(false);
        }
    };

    const showContactList = isOnMobileApp && contacts.length > 0;
    const showGuide = !isOnMobileApp || (permissionDenied && !isWaitingForContacts);
    const showNoResults = showContactList && !!search.trim() && filteredContacts.length === 0;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('inviteFriends.selectTitle')} />

            {showContactList && (
                <div className="px-4 pt-2">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={t('inviteFriends.searchPlaceholder')}
                        label={t('inviteFriends.searchPlaceholder')}
                        trailing={
                            <button
                                type="button"
                                aria-label={t('inviteFriends.sendLink')}
                                onClick={() => setAddFriendOpen(true)}
                                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
                            >
                                <IconLink className="size-5" strokeWidth={2} />
                            </button>
                        }
                    />

                    <div className="flex items-center justify-between px-1 pt-4">
                        <span className="text-[16px] font-semibold text-foreground">
                            {t('inviteFriends.selectTitle')}{' '}
                            <span className="text-description">
                                {selectedIds.size}/{MAX_INVITE_SELECTION}
                            </span>
                        </span>
                        {selectedIds.size > 0 && (
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="text-[14px] font-medium text-description underline"
                            >
                                {t('inviteFriends.deselectAll')}
                            </button>
                        )}
                    </div>

                    <SelectedAvatarRow
                        items={selectedItems}
                        onRemove={removeSelected}
                        removeLabel={t('inviteFriends.deselectAll')}
                        className="px-0"
                    />
                </div>
            )}

            {showContactList && (
                <div className="flex flex-1 flex-col overflow-y-auto overscroll-none pb-safe-bottom">
                    {showNoResults ? (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-center text-[16px] text-description">
                                {t('inviteFriends.noSearchResults')}
                            </p>
                        </div>
                    ) : (
                        filteredContacts.map(contact => {
                            const selected = selectedIds.has(contact.recordID);
                            const hasValidPhone = extractValidPhone(contact) !== null;
                            return (
                                <SelectableUserItem
                                    key={contact.recordID}
                                    name={contactName(contact)}
                                    checked={selected}
                                    onToggle={next => handleToggle(contact, next)}
                                    disabled={(!hasValidPhone && !selected) || isBatchInviting}
                                />
                            );
                        })
                    )}
                </div>
            )}

            {showGuide && (
                <div className="flex flex-1 flex-col overflow-y-auto pb-safe-bottom">
                    {isOnMobileApp ? (
                        <PermissionDeniedBanner />
                    ) : (
                        <div className="flex flex-col gap-1 px-5 pb-2 pt-5">
                            <span className="text-[17px] font-medium tracking-[-0.34px] text-foreground">
                                {t('inviteFriends.webGuide.title')}
                            </span>
                            <p className="text-[14px] leading-[1.5] tracking-[-0.07px] text-description">
                                {t('inviteFriends.webGuide.description')}
                            </p>
                        </div>
                    )}
                    <div className="px-5 pt-2">
                        <Button variant="outline" tone="black" size="md" onClick={() => setAddFriendOpen(true)}>
                            {t('inviteFriends.sendLink')}
                            <IconLink className="size-[18px]" strokeWidth={2} />
                        </Button>
                    </div>
                </div>
            )}

            {showContactList && selectedIds.size > 0 && (
                <>
                    <div className="shrink-0 px-4 pb-4 pt-3">
                        <Button tone="green" size="lg" fullWidth loading={isBatchInviting} onClick={handleBatchInvite}>
                            {t('inviteFriends.inviteSelected', { count: selectedIds.size })}
                        </Button>
                    </div>
                    {/* The CTA above only pads itself by `pb-4`; this reserves the home-indicator
                        inset and lifts it above the keyboard raised by the search field. */}
                    <KeyboardSafeAreaSpacer />
                </>
            )}

            <AddFriendSheet open={addFriendOpen} onOpenChange={setAddFriendOpen} channelId={channelId} />
        </div>
    );
};
