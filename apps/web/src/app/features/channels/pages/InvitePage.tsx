import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import type { ContactInfo } from '@chatic/app-messages';
import { isNative, logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import {
    Button,
    FloatingButton,
    IconLink,
    SearchInput,
    SegmentedTabs,
    SelectableUserItem,
    SelectedAvatarRow,
} from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { PageHeader } from '../../../ui/components';
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useChannel, useCreateInviteBatch } from '../hooks';
import { AddFriendSheet } from '../components/AddFriendSheet';
import { PlaceInviteTab } from '../components/PlaceInviteTab';
import { PermissionDeniedBanner } from '../components/PermissionDeniedBanner';
import {
    contactSearchText,
    resolveContactDisplayPhone,
    resolveContactName,
    resolveContactPhone,
} from '../utils/deviceContact';
import { getRoomDistance } from '../utils/roomDistance';

/** A single invite batch selects at most this many friends. Shared with the place tab. */
const MAX_INVITE_SELECTION = 100;

type InviteTab = 'place' | 'contact';

/**
 * 채널 친구 초대 페이지 — 기존 InviteFriendsDialog를 라우팅 페이지로 전환한 것.
 * 네이티브: 디바이스 연락처를 다중 선택해 일괄 초대. 웹: 연락처 접근 불가 → 초대 링크 흐름으로 유도.
 */
export const InvitePage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();
    // Reached from the room directly (1 hop) or via settings (2); default to the direct case.
    const roomDistance = getRoomDistance(useLocation().state, 1);

    const isOnMobileApp = isNative();
    // Place first: most people worth adding are already here, and on web the contact tab is only a
    // link-invite prompt (there is no device contacts access). See ADR-0075.
    const [activeTab, setActiveTab] = useState<InviteTab>('place');
    const { channel } = useChannel(channelId ?? null);
    const [search, setSearch] = useState('');
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(isOnMobileApp);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchInviting, setIsBatchInviting] = useState(false);

    const { createSingleInvite, createBatchInvite } = useCreateInviteBatch();

    // Bound here because the chain's last resort is a translated label: a contact with no name, no
    // company and no number would otherwise render as an empty row (see resolveContactName).
    const nameOf = useCallback(
        (contact: ContactInfo) => resolveContactName(contact, t('inviteFriends.unnamedContact')),
        [t]
    );

    /**
     * 네이티브에서만 연락처를 불러온다. 웹은 연락처 접근 불가 → 초대 링크 유도.
     *
     * 연락처 탭에 실제로 들어왔을 때만 부른다. `getContacts()`는 OS 권한 팝업을 띄우므로, 기본
     * 탭이 플레이스가 된 뒤로는 마운트 시 호출하면 **연락처를 쓸 생각도 없는 사용자에게 권한을
     * 묻게 된다.**
     *
     * 트리거는 `activeTab`이 아니라 **한 번이라도 열렸는가**(`contactsRequested`)다. 탭 값에
     * 직접 의존시키면 탭을 되돌릴 때 cleanup이 돌아 진행 중인 요청이 취소되는데, 그 사이
     * 응답이 오면 아무 상태도 세팅되지 않은 채 재요청 가드만 남아 연락처 탭이 영영 빈 화면이
     * 된다. 이 플래그는 false→true로 한 번만 바뀌므로 effect도 한 번만 돌고, cleanup은
     * 언마운트에서만 실행된다.
     */
    const [contactsRequested, setContactsRequested] = useState(false);
    useEffect(() => {
        if (activeTab === 'contact') setContactsRequested(true);
    }, [activeTab]);

    useEffect(() => {
        if (!isOnMobileApp || !contactsRequested) return;
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
    }, [isOnMobileApp, contactsRequested]);

    /**
     * 번호가 하나도 저장돼 있지 않은 연락처는 목록에서 빼둔다.
     *
     * 초대는 번호로 나가므로 그런 행은 초대할 수도, 심지어 이름 대신 번호로 알아볼 수도 없다 —
     * 눌리지 않는 행을 남겨두는 것보다 아예 보이지 않는 게 낫다. 판정은 라벨을 만드는 함수와
     * **같은 것**을 쓴다(`resolveContactDisplayPhone`): 보여줄 번호가 없다는 것과 목록에서 뺀다는
     * 것이 어긋나지 않게.
     *
     * 유효한 한국 휴대폰이 아닌 번호(집전화·해외번호)는 여기서 걸러내지 **않는다**. 그 행은 번호로
     * 식별되고, 초대만 비활성이다 — "저장돼 있는데 안 보인다"와 "초대할 수 없다"는 다른 이야기다.
     */
    const listedContacts = useMemo(() => contacts.filter(c => resolveContactDisplayPhone(c) !== ''), [contacts]);

    // 선택된 연락처는 필터 무관하게 상단, 나머지는 검색 필터 적용.
    const filteredContacts = useMemo(() => {
        const selected: ContactInfo[] = [];
        const unselected: ContactInfo[] = [];
        for (const contact of listedContacts) {
            (selectedIds.has(contact.recordID) ? selected : unselected).push(contact);
        }
        let rest = unselected;
        if (search.trim()) {
            const q = search.toLowerCase();
            rest = unselected.filter(c => contactSearchText(c).includes(q));
        }
        return [...selected, ...rest];
    }, [listedContacts, search, selectedIds]);

    const selectedItems = useMemo(
        () => listedContacts.filter(c => selectedIds.has(c.recordID)).map(c => ({ id: c.recordID, name: nameOf(c) })),
        [listedContacts, selectedIds, nameOf]
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
        for (const contact of listedContacts) {
            if (!selectedIds.has(contact.recordID)) continue;
            const phone = resolveContactPhone(contact);
            if (phone) recipients.push({ name: nameOf(contact), phone });
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
            logger.error('INVITE', '[InvitePage] invite failed', { error });
            const message = error instanceof Error ? error.message : t('inviteFriends.batchFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsBatchInviting(false);
        }
    };

    const showContactList = isOnMobileApp && contacts.length > 0;
    const showGuide = !isOnMobileApp || (permissionDenied && !isWaitingForContacts);
    // The list can now come out empty without a search term — every contact received may lack a
    // number. The screen still belongs to the picker (search + link invite), so say why instead of
    // rendering a blank panel.
    const isListEmpty = showContactList && filteredContacts.length === 0;
    const hasSelection = selectedIds.size > 0;

    const tabs = [
        { id: 'place', label: t('inviteFriends.tabPlace') },
        { id: 'contact', label: t('inviteFriends.tabContact') },
    ];
    const isContactTab = activeTab === 'contact';

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('inviteFriends.selectTitle')} />

            <SegmentedTabs items={tabs} value={activeTab} onChange={id => setActiveTab(id as InviteTab)} />

            {/* Each tab keeps its own selection and its own confirm action, so they are separate
                subtrees rather than one body with a switch inside — see ADR-0075. */}
            {!isContactTab && channelId && (
                <PlaceInviteTab channelId={channelId} sid={channel?.sid ?? null} maxSelection={MAX_INVITE_SELECTION} />
            )}

            {isContactTab && showContactList && (
                <div className="shrink-0 px-4 pt-2">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={t('inviteFriends.searchPlaceholder')}
                        label={t('inviteFriends.searchPlaceholder')}
                        trailing={
                            <div className="flex shrink-0 items-center gap-2">
                                {/* Invite by link. This is also the way out of a truncated list:
                                    partial contacts access returns a short list with nothing in the
                                    payload saying so, and a name + number typed here reaches someone
                                    the picker never showed. (The OS settings route stays on the
                                    empty/denied banner, which is where a blank list lands.) */}
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

            {isContactTab && showContactList && (
                <div className="flex flex-1 flex-col overflow-y-auto overscroll-none px-2 pt-2">
                    {isListEmpty ? (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-center text-[16px] text-description">
                                {t(
                                    search.trim()
                                        ? 'inviteFriends.noSearchResults'
                                        : 'inviteFriends.noInvitableContacts'
                                )}
                            </p>
                        </div>
                    ) : (
                        filteredContacts.map(contact => {
                            const selected = selectedIds.has(contact.recordID);
                            const hasValidPhone = resolveContactPhone(contact) !== null;
                            return (
                                <SelectableUserItem
                                    key={contact.recordID}
                                    name={nameOf(contact)}
                                    checked={selected}
                                    onToggle={next => handleToggle(contact, next)}
                                    disabled={(!hasValidPhone && !selected) || isBatchInviting}
                                />
                            );
                        })
                    )}
                </div>
            )}

            {isContactTab && showGuide && (
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

            {isContactTab && showContactList && (
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

            <AddFriendSheet
                open={addFriendOpen}
                onOpenChange={setAddFriendOpen}
                channelId={channelId}
                roomDistance={roomDistance}
            />
        </div>
    );
};
