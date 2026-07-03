// Trims a display-name input and enforces a minimum length. Returns the trimmed value, or null
// when it's too short to save. Shared by the cloud / account / profile name inputs so the
// "blank or too short → don't save" rule lives in one tested place.
export const normalizeName = (input: string, minLength = 1): string | null => {
    const trimmed = input.trim();
    return trimmed.length >= minLength ? trimmed : null;
};
