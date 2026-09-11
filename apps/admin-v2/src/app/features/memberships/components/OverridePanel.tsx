/**
 * `components/memberships/OverridePanel.tsx`
 * - The grant / block / release form, and the confirmation that stands between it and the relay.
 *
 * The form's own logic — validation, the request body, the confirmation wording — lives in
 * `lib/overrideForm.ts`. This file is the surface that collects it.
 */
import { useState } from 'react';

import { logger } from '@chatic/bridges';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { Switch } from '@chatic/ui-kit/components/ui/switch';
import { Textarea } from '@chatic/ui-kit/components/ui/textarea';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { useProductPlans, useUpdateMembershipByAdmin } from '../api/membershipsQuery';
import {
    buildOverrideBody,
    dayOffsetInput,
    describeOverride,
    emptyOverrideForm,
    shouldSendAuto,
    toEpochEndOfDay,
    validateOverrideForm,
    type BlockStatus,
    type OverrideFormState,
    type OverrideMode,
} from '../lib/overrideForm';
import { configuredEndpoint, describeTargetServer, relayBaseFor, type RelayStage } from '../lib/targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

interface OverridePanelProps {
    membership: MembershipView;
    onDone: (updated: MembershipView) => void;
    /** The relay this write lands on — named in the confirmation, because it is switchable. */
    stage: RelayStage;
}

/** Spans an operator reaches for; the picker stays for anything else. */
const UNTIL_PRESETS: { label: string; days: number }[] = [
    { label: '7일', days: 7 },
    { label: '30일', days: 30 },
    { label: '90일', days: 90 },
    { label: '1년', days: 365 },
];

const MODE_LABEL: Record<OverrideMode, string> = {
    grant: '부여',
    block: '차단',
    release: '해제',
};

export const OverridePanel = ({ membership, onDone, stage }: OverridePanelProps): JSX.Element => {
    const [form, setForm] = useState<OverrideFormState>(emptyOverrideForm);
    const [confirming, setConfirming] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const { data: plans } = useProductPlans();
    const { mutateAsync, isPending } = useUpdateMembershipByAdmin();

    // Never fall back to `membership.id` — that is `MS<uid>`, and writing to it targets nothing.
    const userId = membership.userId ?? '';
    const target = describeTargetServer(relayBaseFor(configuredEndpoint(), stage));
    // One clock for the whole render: the `min` attribute, the presets and the validation all
    // have to agree on what "today" is.
    const now = Date.now();
    const errors = validateOverrideForm(form, now);
    const untilAt = toEpochEndOfDay(form.until);
    const untilPreview = untilAt === undefined ? '' : new Date(untilAt).toLocaleDateString();
    const summary = describeOverride(form, membership);
    const patch = (over: Partial<OverrideFormState>) => setForm(prev => ({ ...prev, ...over }));

    const submit = async () => {
        setFailure(null);
        try {
            const updated = await mutateAsync({
                userId,
                body: buildOverrideBody(form),
                auto: shouldSendAuto(form),
                stage,
            });
            setConfirming(false);
            setForm(emptyOverrideForm());
            onDone(updated);
        } catch (error) {
            logger.error('GLOBAL', '[OverridePanel] admin override failed', { error, userId });
            setFailure(error instanceof Error ? error.message : '요청이 실패했습니다.');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-1.5">
                {(Object.keys(MODE_LABEL) as OverrideMode[]).map(mode => (
                    <Button
                        key={mode}
                        size="sm"
                        variant={form.mode === mode ? 'default' : 'outline'}
                        onClick={() => patch({ mode })}
                    >
                        {MODE_LABEL[mode]}
                    </Button>
                ))}
            </div>

            {form.mode === 'block' && (
                <div className="space-y-1.5">
                    <Label>차단 상태</Label>
                    <div className="flex gap-1.5">
                        {(['expired', 'canceled'] as BlockStatus[]).map(status => (
                            <Button
                                key={status}
                                size="sm"
                                variant={form.blockStatus === status ? 'secondary' : 'outline'}
                                onClick={() => patch({ blockStatus: status })}
                            >
                                {status}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {form.mode !== 'release' && (
                <div className="space-y-1.5">
                    <Label htmlFor="override-until">만료일</Label>
                    <Input
                        id="override-until"
                        type="date"
                        className="h-9 px-3 py-0 text-sm"
                        // The relay refuses a past `adminUntil`; today is the earliest that passes.
                        min={dayOffsetInput(0, now)}
                        value={form.until}
                        onChange={event => patch({ until: event.target.value })}
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {UNTIL_PRESETS.map(preset => {
                            const value = dayOffsetInput(preset.days, now);
                            return (
                                <Button
                                    key={preset.days}
                                    size="sm"
                                    variant={form.until === value ? 'secondary' : 'outline'}
                                    onClick={() => patch({ until: value })}
                                >
                                    {preset.label}
                                </Button>
                            );
                        })}
                        {/* Indefinite is the absence of a date, not a sentinel far in the future. */}
                        <Button
                            size="sm"
                            variant={form.until ? 'outline' : 'secondary'}
                            onClick={() => patch({ until: '' })}
                        >
                            무기한
                        </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                        {untilPreview
                            ? `${untilPreview} 끝까지 유효합니다.`
                            : '무기한입니다. 해제하기 전까지 유지됩니다.'}
                    </p>
                </div>
            )}

            {form.mode === 'grant' && (
                <div className="space-y-1.5">
                    <Label htmlFor="override-product">등급</Label>
                    <select
                        id="override-product"
                        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                        value={form.productId}
                        onChange={event => patch({ productId: event.target.value })}
                    >
                        <option value="">바꾸지 않음</option>
                        {(plans?.list ?? []).map(plan => (
                            <option key={plan.id} value={plan.id}>
                                {plan.id} {plan.maxClouds ? `(최대 ${plan.maxClouds}개)` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {form.mode === 'grant' && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                        <Label htmlFor="override-auto">즉시 Cloud 생성 (auto)</Label>
                        <p className="text-muted-foreground text-xs">늘어난 한도만큼 생성 요청을 큐에 넣습니다.</p>
                    </div>
                    <Switch id="override-auto" checked={form.auto} onCheckedChange={auto => patch({ auto })} />
                </div>
            )}

            <div className="space-y-1.5">
                <Label htmlFor="override-reason">사유 (필수)</Label>
                <Textarea
                    id="override-reason"
                    value={form.reason}
                    onChange={event => patch({ reason: event.target.value })}
                    placeholder="왜 이 조작을 하는지 적어 주세요"
                />
            </div>

            {errors.length > 0 && (
                <ul className="text-destructive space-y-0.5 text-xs">
                    {errors.map(error => (
                        <li key={error}>{error}</li>
                    ))}
                </ul>
            )}

            {/* Shown for anything that fails before the dialog opens; the dialog renders its own
                copy, because this one sits under the dialog's overlay once it is open. */}
            {failure && !confirming && <p className="text-destructive text-xs">{failure}</p>}

            <Button
                className="w-full"
                disabled={errors.length > 0 || isPending || !userId}
                onClick={() => setConfirming(true)}
            >
                {isPending ? '적용 중…' : `${MODE_LABEL[form.mode]} 실행`}
            </Button>

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{summary.title}</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                <ul className="list-disc space-y-1 pl-4 text-sm">
                                    {summary.lines.map(line => (
                                        <li key={line}>{line}</li>
                                    ))}
                                </ul>
                                {/* The console is not deployed, so whichever relay the local .env
                                    names is the one being written to. Say which, here as well. */}
                                <div className="flex items-center gap-1.5 pt-1">
                                    <span className="text-xs">대상 서버</span>
                                    <Badge variant={target.isProd ? 'destructive' : 'outline'}>{target.label}</Badge>
                                    <span className="text-muted-foreground font-mono text-xs">{target.endpoint}</span>
                                </div>
                                {failure && (
                                    <p className="text-destructive pt-1 text-xs">요청이 실패했습니다 — {failure}</p>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>취소</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isPending}
                            onClick={event => {
                                event.preventDefault();
                                void submit();
                            }}
                        >
                            {isPending ? '적용 중…' : '실행'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
