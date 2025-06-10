import moment from 'moment';
export const formatDate = (value: number, format: string) => {
    if (!value || !format) {
        return '-';
    }

    return moment(value).format(format) || '-';
};
