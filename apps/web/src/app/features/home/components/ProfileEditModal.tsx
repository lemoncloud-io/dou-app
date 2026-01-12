import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Edit3, Loader2, Mail, Phone, Save, User, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card } from '@chatic/ui-kit/components/ui/card';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@chatic/ui-kit/components/ui/select';
import { Separator } from '@chatic/ui-kit/components/ui/separator';
import { useWebCoreStore } from '@chatic/web-core';

interface ProfileEditModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ProfileEditModal = ({ isOpen, onClose }: ProfileEditModalProps) => {
    const { t } = useTranslation();
    const profile = useWebCoreStore(state => state.profile);
    const updateProfile = useWebCoreStore(state => state.updateProfile);

    const [isLoading, setIsLoading] = useState(false);
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

        setIsLoading(true);
        try {
            await updateProfile({
                nick: formData.nick.trim(),
                gender: formData.gender,
                text: formData.text.trim(),
            });

            console.log(formData);

            toast.success(t('profile.updateSuccess', 'Profile updated successfully'));
            onClose();
        } catch (error) {
            toast.error(t('profile.updateError', 'Failed to update profile'));
            console.error('Profile update error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl mx-4">
                {/* Background Effects */}
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-orange-500/10 rounded-full blur-xl animate-float" />
                <div
                    className="absolute -bottom-10 -right-10 w-24 h-24 bg-yellow-500/10 rounded-full blur-xl animate-float"
                    style={{ animationDelay: '2s' }}
                />

                <Card className="glass-strong border-0 p-6 animate-scale-in">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-lemon-gradient rounded-full flex items-center justify-center">
                                <Edit3 className="w-6 h-6 text-white" />
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
                            className="text-secondary-content hover:text-primary-content hover:bg-white/10"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    <Separator className="mb-6 bg-white/10" />

                    {/* Profile Info */}
                    <div className="space-y-6">
                        {/* Read-only Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-secondary-content flex items-center">
                                    <User className="w-4 h-4 mr-2" />
                                    {t('profile.name', 'Full Name')}
                                </label>
                                <div className="glass p-3 rounded-lg border border-white/10">
                                    <span className="text-primary-content">{profile?.$user?.name || 'N/A'}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-secondary-content flex items-center">
                                    <Mail className="w-4 h-4 mr-2" />
                                    {t('profile.email', 'Email')}
                                </label>
                                <div className="glass p-3 rounded-lg border border-white/10">
                                    <span className="text-primary-content">{profile?.$user?.email || 'N/A'}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-secondary-content flex items-center">
                                    <Phone className="w-4 h-4 mr-2" />
                                    {t('profile.phone', 'Phone')}
                                </label>
                                <div className="glass p-3 rounded-lg border border-white/10">
                                    <span className="text-primary-content">{profile?.$user?.phone || 'N/A'}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-secondary-content">
                                    {t('profile.role', 'Role')}
                                </label>
                                <div className="glass p-3 rounded-lg border border-white/10">
                                    <span className="text-primary-content capitalize">
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                            className="glass-strong border-white/20 z-[110]" // Add explicit z-index higher than modal
                                            position="popper" // Ensure proper positioning
                                            side="bottom"
                                            align="start"
                                        >
                                            <SelectItem value="male">{t('profile.gender.male', 'Male')}</SelectItem>
                                            <SelectItem value="female">
                                                {t('profile.gender.female', 'Female')}
                                            </SelectItem>
                                            <SelectItem value="other">{t('profile.gender.other', 'Other')}</SelectItem>
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
                    <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-white/10">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={isLoading}
                            className="glass border-white/20 hover:bg-white/10 text-primary-content"
                        >
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="bg-lemon-gradient hover:opacity-90 text-white"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {t('common.saving', 'Saving...')}
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    {t('common.save', 'Save Changes')}
                                </>
                            )}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
