export interface CreateChannelDto {
    name: string;
    type: 'direct' | 'group' | 'self';
}

export interface UpdateChannelDto {
    name?: string;
}
