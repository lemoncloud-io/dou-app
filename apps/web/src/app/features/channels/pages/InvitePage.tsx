import { BookUser } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import type { ContactInfo } from '@chatic/app-messages';
import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import {
    Button,
    FloatingButton,
    IconLink,
    SearchInput,
    SelectableUserItem,
    SelectedAvatarRow,
} from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { PageHeader } from '../../../ui/components';
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
// Direct path for `phoneNumber`: it is deliberately kept out of the `utils` barrel (libphonenumber's
// metadata — see that barrel's comment).
import { toError } from '../../../utils/errors';
import { toE164 } from '../../../utils/phoneNumber';
import { useCreateInviteBatch } from '../hooks';
import { AddFriendSheet } from '../components/AddFriendSheet';
import { PermissionDeniedBanner } from '../components/PermissionDeniedBanner';
import { isValidKoreanPhone, normalizeKoreanPhone } from '../utils/koreanPhone';

/** A single invite batch selects at most this many friends. */
const MAX_INVITE_SELECTION = 100;

/**
 * 연락처에서 유효한 휴대폰 번호를 **E.164**(`+8210…`)로 추출합니다. 유효하지 않으면 null.
 *
 * wire 값은 로컬형(`010…`)이 아니라 E.164다: 백엔드 해셔(`asE164Phone`)는 로컬형일 때만
 * `countryCode`를 읽는데, `user.invite-batch` 페이로드에는 국가를 실을 자리가 아예 없다
 * (`to`/`channelId`/`cloudId`/`cloudName`). 즉 국가가 번호 안에 들어 있어야 한다 (ADR-0044 §5).
 * 이 화면은 연락처가 국가를 알려주지 않으므로 한국 번호 검증을 그대로 유지하고 KR로 변환한다.
 */
const extractValidPhone = (contact: ContactInfo): string | null => {
    const phoneNumber = contact.phoneNumbers?.[0]?.number;
    if (!phoneNumber) return null;
    const normalized = normalizeKoreanPhone(phoneNumber.replace(/\D/g, ''));
    return isValidKoreanPhone(normalized) ? toE164(normalized, 'KR') : null;
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

    const openContactSettings = useCallback(() => {
        if (isOnMobileApp) appBridge.openSettings();
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
                // One recipient goes out as a text to that number, so the toast has to say what
                // actually happened — on web the link only reached the clipboard.
                const { channel } = await createSingleInvite({
                    channelId,
                    name: recipients[0].name,
                    phone: recipients[0].phone,
                });
                toast({
                    title: t(
                        channel === 'sms'
                            ? 'inviteFriends.sentSms'
                            : channel === 'clipboard'
                              ? 'inviteFriends.sentClipboard'
                              : 'inviteFriends.sentFailed'
                    ),
                    ...(channel === false && { variant: 'destructive' as const }),
                });
            } else {
                await createBatchInvite({ channelId, phones: recipients.map(r => r.phone) });
                // The server fans the batch out over SMS itself, so there is nothing to hand off here.
                toast({ title: t('inviteFriends.batchSuccess', { count: recipients.length }) });
            }
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
    const hasSelection = selectedIds.size > 0;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('inviteFriends.selectTitle')} />

            {showContactList && (
                <div className="shrink-0 px-4 pt-2">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={t('inviteFriends.searchPlaceholder')}
                        label={t('inviteFriends.searchPlaceholder')}
                        trailing={
                            <div className="flex shrink-0 items-center gap-2">
                                {/* Partial contacts access hands back a truncated list and nothing in the
                                    payload says so, so the settings route has to stay reachable from the
                                    populated list — not only from the empty/denied state. */}
                                <button
                                    type="button"
                                    aria-label={t('inviteFriends.openContactSettings')}
                                    onClick={openContactSettings}
                                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
                                >
                                    <BookUser className="size-5" strokeWidth={2} />
                                </button>
                                {/* Invite by link, alongside — not instead of — the settings route:
                                    the two solve different problems (reach someone not in your
                                    contacts vs. escape a truncated contact list). */}
                                <button
                                    type="button"
                                    aria-label={t('inviteFriends.sendLink')}
                                    onClick={() => setAddFriendOpen(true)}
                                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
                                >
                                    <IconLink className="size-5" strokeWidth={2} />
                                </button>
                            </div>
                        }
                    />

                    <div className="flex items-center justify-between gap-2 pt-4">
                        <span className="flex items-center gap-2 text-[18px] font-semibold leading-[25px] tracking-[-0.5px] text-foreground">
                            {t('inviteFriends.selectTitle')}
                            <span className="text-placeholder">
                                <span className={hasSelection ? 'text-foreground' : undefined}>{selectedIds.size}</span>
                                /{MAX_INVITE_SELECTION}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={clearSelection}
                            disabled={!hasSelection}
                            className="shrink-0 text-[15px] font-medium leading-[25px] tracking-[-0.5px] text-foreground underline disabled:text-placeholder"
                        >
                            {t('inviteFriends.deselectAll')}
                        </button>
                    </div>

                    {hasSelection && (
                        <div className="mb-2 mt-4 h-[90px] overflow-hidden rounded-[8px] bg-secondary">
                            <SelectedAvatarRow
                                items={selectedItems}
                                onRemove={removeSelected}
                                removeLabel={t('inviteFriends.deselectAll')}
                                className="h-full items-center px-3 py-0"
                            />
                        </div>
                    )}
                </div>
            )}

            {showContactList && (
                <div className="flex flex-1 flex-col overflow-y-auto overscroll-none px-2 pt-2">
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
                    <div className="px-5 pt-4">
                        <Button variant="outline" tone="black" size="md" onClick={() => setAddFriendOpen(true)}>
                            {t('inviteFriends.sendLink')}
                            <IconLink className="size-[18px]" strokeWidth={2} />
                        </Button>
                    </div>
                </div>
            )}

            {showContactList && (
                <>
                    {/* Docked from the moment the list appears (disabled until something is picked),
                        matching the Figma "완료" CTA. */}
                    <FloatingButton
                        label={t('inviteFriends.done')}
                        loading={isBatchInviting}
                        disabled={!hasSelection}
                        onClick={handleBatchInvite}
                        wrapperClassName="shrink-0"
                    />
                    {/* The CTA panel above only pads itself by `pb-4`; this reserves the home-indicator
                        inset and lifts it above the keyboard raised by the search field. */}
                    <KeyboardSafeAreaSpacer />
                </>
            )}

            <AddFriendSheet open={addFriendOpen} onOpenChange={setAddFriendOpen} channelId={channelId} />
        </div>
    );
};
