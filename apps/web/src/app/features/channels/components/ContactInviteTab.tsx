import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ContactInfo } from '@chatic/bridge-messages';
import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import {
    Button,
    FloatingButton,
    IconLink,
    SearchInput,
    SelectableUserItem,
    SelectedAvatarRow,
} from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import type { InviteMessageChannel } from '../../invite/utils/sendInviteMessage';
import { PermissionDeniedBanner } from './PermissionDeniedBanner';
import {
    compareContactLabels,
    contactSearchText,
    resolveContactDisplayPhone,
    resolveContactName,
    resolveContactPhone,
    resolveContactSubtitle,
} from '../utils/deviceContact';

interface ContactInviteTabProps {
    active: boolean;
    maxSelection: number;
    onLimitReached?: () => void;
    sendSingle: (recipient: { name: string; phone: string }) => Promise<InviteMessageChannel | false>;
    sendBatch: (phones: string[]) => Promise<unknown>;
    onSent: () => void;
    onRequestLink: () => void;
    webGuideDescription?: string;
}

export const ContactInviteTab = ({
    active,
    maxSelection,
    onLimitReached,
    sendSingle,
    sendBatch,
    onSent,
    onRequestLink,
    webGuideDescription,
}: ContactInviteTabProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();

    const isOnMobileApp = runtime.links.contacts !== null;
    const [search, setSearch] = useState('');
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(isOnMobileApp);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchInviting, setIsBatchInviting] = useState(false);

    const nameOf = useCallback(
        (contact: ContactInfo) => resolveContactName(contact, t('inviteFriends.unnamedContact')),
        [t]
    );

    const [contactsRequested, setContactsRequested] = useState(false);
    useEffect(() => {
        if (active) setContactsRequested(true);
    }, [active]);

    useEffect(() => {
        const addressBook = runtime.links.contacts;
        if (!addressBook || !contactsRequested) return;
        let cancelled = false;
        setIsWaitingForContacts(true);
        addressBook
            .read()
            .then(answer => {
                if (cancelled) return;
                const received = answer?.contacts ?? [];
                const permission = answer?.permission;
                setIsWaitingForContacts(false);
                setContacts(received);
                setPermissionDenied(permission === 'denied');
            })
            .catch(() => {
                if (cancelled) return;
                setIsWaitingForContacts(false);
                setPermissionDenied(true);
            });
        return () => {
            cancelled = true;
        };
    }, [contactsRequested]);

    const listedContacts = useMemo(
        () =>
            contacts
                .filter(c => resolveContactDisplayPhone(c) !== '')
                .map(contact => ({ contact, label: nameOf(contact) }))
                .sort((a, b) => compareContactLabels(a.label, b.label))
                .map(({ contact }) => contact),
        [contacts, nameOf]
    );

    const query = search.trim().toLowerCase();

    const matchedContacts = useMemo(
        () => (query ? listedContacts.filter(c => contactSearchText(c).includes(query)) : listedContacts),
        [listedContacts, query]
    );

    const filteredContacts = useMemo(
        () => [
            ...listedContacts.filter(c => selectedIds.has(c.recordID)),
            ...matchedContacts.filter(c => !selectedIds.has(c.recordID)),
        ],
        [listedContacts, matchedContacts, selectedIds]
    );

    const listedCount = matchedContacts.length;

    const selectedItems = useMemo(
        () => listedContacts.filter(c => selectedIds.has(c.recordID)).map(c => ({ id: c.recordID, name: nameOf(c) })),
        [listedContacts, selectedIds, nameOf]
    );

    const handleToggle = useCallback(
        (contact: ContactInfo, next: boolean) => {
            if (isBatchInviting) return;
            if (next && selectedIds.size >= maxSelection && !selectedIds.has(contact.recordID)) {
                if (onLimitReached) onLimitReached();
                else toast({ title: t('inviteFriends.limitToast', { max: maxSelection }) });
                return;
            }
            setSelectedIds(prev => {
                if (next && prev.size >= maxSelection && !prev.has(contact.recordID)) return prev;
                const updated = new Set(prev);
                if (next) {
                    updated.add(contact.recordID);
                } else {
                    updated.delete(contact.recordID);
                }
                return updated;
            });
        },
        [isBatchInviting, selectedIds, maxSelection, onLimitReached, toast, t]
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
        if (selectedIds.size === 0 || isBatchInviting) return;

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
                const channel = await sendSingle(recipients[0]);
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
                await sendBatch(recipients.map(r => r.phone));
                toast({ title: t('inviteFriends.batchSuccess', { count: recipients.length }) });
            }
            onSent();
        } catch (error) {
            logger.error('INVITE', '[ContactInviteTab] invite failed', { error });
            const message = error instanceof Error ? error.message : t('inviteFriends.batchFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsBatchInviting(false);
        }
    };

    if (!active) return null;

    const showContactList = isOnMobileApp && !isWaitingForContacts && !permissionDenied;
    const showGuide = !isOnMobileApp || (permissionDenied && !isWaitingForContacts);
    const isListEmpty = showContactList && filteredContacts.length === 0;
    const hasSelection = selectedIds.size > 0;

    return (
        <>
            {showContactList && (
                <div className="shrink-0 px-4 pt-2">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={t('inviteFriends.searchPlaceholder')}
                        label={t('inviteFriends.searchPlaceholder')}
                        trailing={
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    aria-label={t('inviteFriends.sendLink')}
                                    onClick={onRequestLink}
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
                                /{maxSelection}
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
                    {!isListEmpty && (
                        <p className="px-4 pb-1 text-[14px] leading-[1.4] text-description">
                            {t(query ? 'inviteFriends.searchResultCount' : 'inviteFriends.contactCount', {
                                count: listedCount,
                            })}
                        </p>
                    )}
                    {isListEmpty ? (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-center text-[16px] text-description">
                                {t(query ? 'inviteFriends.noSearchResults' : 'inviteFriends.noInvitableContacts')}
                            </p>
                        </div>
                    ) : (
                        filteredContacts.map(contact => {
                            const selected = selectedIds.has(contact.recordID);
                            const hasValidPhone = resolveContactPhone(contact) !== null;
                            const name = nameOf(contact);
                            return (
                                <SelectableUserItem
                                    key={contact.recordID}
                                    name={name}
                                    subtitle={resolveContactSubtitle(contact, name)}
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
                                {webGuideDescription ?? t('inviteFriends.webGuide.description')}
                            </p>
                        </div>
                    )}
                    <div className="px-5 pt-4">
                        <Button variant="outline" tone="black" size="md" onClick={onRequestLink}>
                            {t('inviteFriends.sendLink')}
                            <IconLink className="size-[18px]" strokeWidth={2} />
                        </Button>
                    </div>
                </div>
            )}

            {showContactList && (
                <>
                    <FloatingButton
                        label={t('inviteFriends.done')}
                        loading={isBatchInviting}
                        disabled={!hasSelection}
                        onClick={handleBatchInvite}
                        wrapperClassName="shrink-0"
                    />
                    <KeyboardSafeAreaSpacer />
                </>
            )}
        </>
    );
};
