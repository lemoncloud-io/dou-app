import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Edit3, Loader2, Mail, Phone, Save, User, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card } from '@chatic/ui-kit/components/ui/card';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@chatic/ui-kit/components/ui/select';
import { Separator } from '@chatic/ui-kit/components/ui/separator';
import { useWebCoreStore } from '@chatic/web-core';

import { useUpdateMyProfile } from '../hooks';

interface ProfileEditModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ProfileEditModal = ({ isOpen, onClose }: ProfileEditModalProps) => {
    const { t } = useTranslation();
    const profile = useWebCoreStore(state => state.profile);
    const { updateProfile, isPending: isUpdatePending } = useUpdateMyProfile();

    const isLoading = isUpdatePending;
    const [formData, setFormData] = useState({
        nick: profile?.$user?.nick || '',
        gender: profile?.$user?.gender || '',
        text: profile?.$user?.text || '',
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.nick?.trim()) {
            newErrors.nick = t('profile.validation.nickRequired', 'Nickname is required');
        } else if (formData.nick.trim().length < 2) {
            newErrors.nick = t('profile.validation.nickTooShort', 'Nickname must be at least 2 characters');
        } else if (formData.nick.trim().length > 50) {
            newErrors.nick = t('profile.validation.nickTooLong', 'Nickname must be less than 50 characters');
        }

        if (!formData.gender) {
            newErrors.gender = t('profile.validation.genderRequired', 'Please select a gender');
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) return;

        try {
            await updateProfile({
                nick: formData.nick.trim(),
                thumbnail: formData.text.trim() || undefined,
            });

            toast.success(t('profile.updateSuccess', 'Profile updated successfully'));
            onClose();
        } catch (error) {
            toast.error(t('profile.updateError', 'Failed to update profile'));
            console.error('Profile update error:', error);
        }
    };

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleOpenChange = (open: boolean) => {
        if (!isLoading && !open) {
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent
                className="flex items-center justify-center border-0 bg-transparent p-0 shadow-none"
                data-prevent-back-close={isLoading ? '' : undefined}
            >
                <DialogTitle className="sr-only">{t('profile.editTitle', 'Edit Profile')}</DialogTitle>
                <DialogDescription className="sr-only">
                    {t('profile.editSubtitle', 'Update your personal information')}
                </DialogDescription>
                <div className="relative mx-4 w-full max-w-2xl">
                    {/* Background Effects */}
                    <div className="absolute -left-10 -top-10 h-32 w-32 animate-float rounded-full bg-orange-500/10 blur-xl" />
                    <div
                        className="absolute -bottom-10 -right-10 h-24 w-24 animate-float rounded-full bg-yellow-500/10 blur-xl"
                        style={{ animationDelay: '2s' }}
                    />

                    <Card className="glass-strong animate-scale-in border-0 p-6">
                        {/* Header */}
                        <div className="mb-6 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lemon-gradient">
                                    <Edit3 className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-primary-content">
                                        {t('profile.editTitle', 'Edit Profile')}
                                    </h2>
                                    <p className="text-secondary-content">
                                        {t('profile.editSubtitle', 'Update your personal information')}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClose}
                                disabled={isLoading}
                                className="text-secondary-content hover:bg-white/10 hover:text-primary-content"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        <Separator className="mb-6 bg-white/10" />

                        {/* Profile Info */}
                        <div className="space-y-6">
                            {/* Read-only Information */}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="flex items-center text-sm font-medium text-secondary-content">
                                        <User className="mr-2 h-4 w-4" />
                                        {t('profile.name', 'Full Name')}
                                    </label>
                                    <div className="glass rounded-lg border border-white/10 p-3">
                                        <span className="text-primary-content">{profile?.$user?.name || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center text-sm font-medium text-secondary-content">
                                        <Mail className="mr-2 h-4 w-4" />
                                        {t('profile.email', 'Email')}
                                    </label>
                                    <div className="glass rounded-lg border border-white/10 p-3">
                                        <span className="text-primary-content">{profile?.$user?.email || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center text-sm font-medium text-secondary-content">
                                        <Phone className="mr-2 h-4 w-4" />
                                        {t('profile.phone', 'Phone')}
                                    </label>
                                    <div className="glass rounded-lg border border-white/10 p-3">
                                        <span className="text-primary-content">{profile?.$user?.phone || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-secondary-content">
                                        {t('profile.role', 'Role')}
                                    </label>
                                    <div className="glass rounded-lg border border-white/10 p-3">
                                        <span className="capitalize text-primary-content">
                                            {profile?.$role?.role || 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <Separator className="bg-white/10" />

                            {/* Editable Fields */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-primary-content">
                                    {t('profile.editableSection', 'Editable Information')}
                                </h3>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-secondary-content">
                                            {t('profile.nickname', 'Nickname')} *
                                        </label>
                                        <Input
                                            value={formData.nick}
                                            onChange={e => handleInputChange('nick', e.target.value)}
                                            className={`glass border-white/20 bg-white/5 text-primary-content placeholder:text-muted-content ${
                                                errors.nick ? 'border-red-400' : 'focus:border-orange-400'
                                            }`}
                                            placeholder={t('profile.nicknamePlaceholder', 'Enter your nickname')}
                                        />
                                        {errors.nick && <p className="text-sm text-red-400">{errors.nick}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-secondary-content">
                                            {t('profile.gender.title', 'Gender')} *
                                        </label>
                                        <Select
                                            value={formData.gender}
                                            onValueChange={value => handleInputChange('gender', value)}
                                        >
                                            <SelectTrigger
                                                className={`glass border-white/20 bg-white/5 text-primary-content ${
                                                    errors.gender ? 'border-red-400' : 'focus:border-orange-400'
                                                }`}
                                            >
                                                <SelectValue placeholder={t('profile.selectGender', 'Select gender')} />
                                            </SelectTrigger>
                                            <SelectContent
                                                className="glass-strong z-[110] border-white/20"
                                                position="popper"
                                                side="bottom"
                                                align="start"
                                            >
                                                <SelectItem value="male">{t('profile.gender.male', 'Male')}</SelectItem>
                                                <SelectItem value="female">
                                                    {t('profile.gender.female', 'Female')}
                                                </SelectItem>
                                                <SelectItem value="other">
                                                    {t('profile.gender.other', 'Other')}
                                                </SelectItem>
                                                <SelectItem value="prefer_not_to_say">
                                                    {t('profile.gender.preferNotToSay', 'Prefer not to say')}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {errors.gender && <p className="text-sm text-red-400">{errors.gender}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-secondary-content">
                                        {t('profile.bio', 'Bio')}
                                    </label>
                                    <Input
                                        value={formData.text}
                                        onChange={e => handleInputChange('text', e.target.value)}
                                        className="glass border-white/20 bg-white/5 text-primary-content placeholder:text-muted-content focus:border-orange-400"
                                        placeholder={t('profile.bioPlaceholder', 'Tell us about yourself')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-8 flex justify-end space-x-3 border-t border-white/10 pt-6">
                            <Button
                                variant="outline"
                                onClick={onClose}
                                disabled={isLoading}
                                className="glass border-white/20 text-primary-content hover:bg-white/10"
                            >
                                {t('common.cancel', 'Cancel')}
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={isLoading}
                                className="bg-lemon-gradient text-white hover:opacity-90"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t('common.saving', 'Saving...')}
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        {t('common.save', 'Save Changes')}
                                    </>
                                )}
                            </Button>
                        </div>
                    </Card>
                </div>
            </DialogContent>
        </Dialog>
    );
};
