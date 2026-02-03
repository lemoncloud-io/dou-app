import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, Dices, Key, Loader2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { generateToken } from '../apis';

import type { TokenGeneratorFormState } from '../types';
import type { JSX } from 'react';

interface TokenGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTokenGenerated?: (token: string) => void;
}

const initialFormState: TokenGeneratorFormState = {
    cid: '',
    sid: '0000',
    aid: '',
    uid: '',
    mid: '',
    gid: '',
};

/**
 * Token Generator Modal Component
 * - Generates test JWT tokens with custom claims
 * - Allows copying generated token to clipboard
 */
export const TokenGeneratorModal = ({ isOpen, onClose, onTokenGenerated }: TokenGeneratorModalProps): JSX.Element => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState<TokenGeneratorFormState>(initialFormState);
    const [errors, setErrors] = useState<Partial<Record<keyof TokenGeneratorFormState, string>>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleInputChange = useCallback((field: keyof TokenGeneratorFormState, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setErrors(prev => ({ ...prev, [field]: undefined }));
        setApiError(null);
    }, []);

    const validateForm = useCallback((): boolean => {
        const newErrors: Partial<Record<keyof TokenGeneratorFormState, string>> = {};
        const requiredFields: (keyof TokenGeneratorFormState)[] = ['cid', 'sid', 'aid', 'uid'];

        requiredFields.forEach(field => {
            if (!formData[field].trim()) {
                newErrors[field] = t('authTest.generateToken.error.required');
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData, t]);

    const handleGenerate = useCallback(async () => {
        if (!validateForm()) return;

        setIsLoading(true);
        setApiError(null);

        try {
            const request = {
                cid: formData.cid.trim(),
                sid: formData.sid.trim(),
                aid: formData.aid.trim(),
                uid: formData.uid.trim(),
                ...(formData.mid.trim() && { mid: formData.mid.trim() }),
                ...(formData.gid.trim() && { gid: formData.gid.trim() }),
            };

            const response = await generateToken(request);
            setGeneratedToken(response.token);
        } catch (error) {
            console.error('[TokenGenerator] Failed to generate token:', error);
            setApiError(t('authTest.generateToken.error.failed'));
        } finally {
            setIsLoading(false);
        }
    }, [formData, validateForm, t]);

    const handleCopy = useCallback(async () => {
        if (!generatedToken) return;

        try {
            await navigator.clipboard.writeText(generatedToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('[TokenGenerator] Failed to copy:', error);
        }
    }, [generatedToken]);

    const handleClose = useCallback(() => {
        setFormData(initialFormState);
        setErrors({});
        setGeneratedToken(null);
        setApiError(null);
        setCopied(false);
        onClose();
    }, [onClose]);

    const handleUseToken = useCallback(() => {
        if (generatedToken) {
            onTokenGenerated?.(generatedToken);
            handleClose();
        }
    }, [generatedToken, onTokenGenerated, handleClose]);

    const handleGenerateUuid = useCallback(
        (field: keyof TokenGeneratorFormState) => {
            const uuid = crypto.randomUUID();
            handleInputChange(field, uuid);
        },
        [handleInputChange]
    );

    const renderFormField = (
        field: keyof TokenGeneratorFormState,
        labelKey: string,
        placeholderKey: string,
        required = true
    ) => (
        <div className="space-y-1.5">
            <Label htmlFor={field} className="text-xs">
                {t(labelKey)}
                {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <Input
                id={field}
                value={formData[field]}
                onChange={e => handleInputChange(field, e.target.value)}
                placeholder={t(placeholderKey)}
                className={cn('h-8 text-xs', errors[field] && 'border-destructive')}
                disabled={isLoading || !!generatedToken}
            />
            {errors[field] && <p className="text-[10px] text-destructive">{errors[field]}</p>}
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        {t('authTest.generateToken.title')}
                    </DialogTitle>
                    <DialogDescription>{t('authTest.generateToken.description')}</DialogDescription>
                </DialogHeader>

                {generatedToken ? (
                    <div className="space-y-4">
                        <div className="rounded-lg border bg-muted/50 p-3">
                            <Label className="text-xs text-muted-foreground">
                                {t('authTest.generateToken.success')}
                            </Label>
                            <div className="mt-2 flex items-start gap-2">
                                <code className="flex-1 break-all text-xs font-mono bg-background p-2 rounded border max-h-32 overflow-auto">
                                    {generatedToken}
                                </code>
                                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleCopy}>
                                    {copied ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={handleClose} className="h-8 text-xs">
                                {t('authTest.generateToken.cancel')}
                            </Button>
                            <Button onClick={handleUseToken} className="h-8 text-xs">
                                {t('authTest.generateToken.useToken')}
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-3 py-2">
                            <div className="grid grid-cols-2 gap-3">
                                {renderFormField(
                                    'cid',
                                    'authTest.generateToken.fields.cid',
                                    'authTest.generateToken.fields.cidPlaceholder'
                                )}
                                {renderFormField(
                                    'sid',
                                    'authTest.generateToken.fields.sid',
                                    'authTest.generateToken.fields.sidPlaceholder'
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="aid" className="text-xs">
                                    {t('authTest.generateToken.fields.aid')}
                                    <span className="text-destructive ml-0.5">*</span>
                                </Label>
                                <div className="flex gap-1.5">
                                    <Input
                                        id="aid"
                                        value={formData.aid}
                                        onChange={e => handleInputChange('aid', e.target.value)}
                                        placeholder={t('authTest.generateToken.fields.aidPlaceholder')}
                                        className={cn('h-8 text-xs flex-1', errors.aid && 'border-destructive')}
                                        disabled={isLoading || !!generatedToken}
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="outline"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => handleGenerateUuid('aid')}
                                        disabled={isLoading || !!generatedToken}
                                        title={t('authTest.generateToken.generateUuid')}
                                    >
                                        <Dices className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                {errors.aid && <p className="text-[10px] text-destructive">{errors.aid}</p>}
                            </div>
                            {renderFormField(
                                'uid',
                                'authTest.generateToken.fields.uid',
                                'authTest.generateToken.fields.uidPlaceholder'
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                {renderFormField(
                                    'mid',
                                    'authTest.generateToken.fields.mid',
                                    'authTest.generateToken.fields.midPlaceholder',
                                    false
                                )}
                                {renderFormField(
                                    'gid',
                                    'authTest.generateToken.fields.gid',
                                    'authTest.generateToken.fields.gidPlaceholder',
                                    false
                                )}
                            </div>
                        </div>

                        {apiError && <p className="text-xs text-destructive text-center">{apiError}</p>}

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                className="h-8 text-xs"
                                disabled={isLoading}
                            >
                                {t('authTest.generateToken.cancel')}
                            </Button>
                            <Button onClick={handleGenerate} className="h-8 text-xs" disabled={isLoading}>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        {t('authTest.generateToken.generating')}
                                    </>
                                ) : (
                                    t('authTest.generateToken.generate')
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};
