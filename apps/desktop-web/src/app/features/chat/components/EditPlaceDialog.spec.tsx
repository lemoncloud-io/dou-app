import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';

import type { DomainPlace } from '@chatic/data';
import type * as ChaticSharedModule from '@chatic/shared';

import type * as SharedModule from '../../../shared';

const prepareImage = vi.hoisted(() => vi.fn());
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<typeof ChaticSharedModule>('@chatic/shared')),
    prepareImage,
}));

const updatePlace = vi.hoisted(() => vi.fn());
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useUpdatePlace: () => ({ updatePlace }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import '../../../../i18n';
import { useEditPlaceDialogStore } from '../stores';
import { PLACE_IMAGE_MAX_BYTES, PLACE_NAME_MAX } from '../utils';
import { EditPlaceDialog } from './EditPlaceDialog';

const OLD_PHOTO = 'https://cdn.example.com/design.jpg';
const NEW_PHOTO = 'data:image/jpeg;base64,AAAA';
const design = { id: 'place-1', name: 'Design', thumbnail: OLD_PHOTO, cid: 'mine' } as DomainPlace;
const plain = { id: 'place-2', name: 'Plain', cid: 'mine' } as DomainPlace;
const places = [design, plain];

const nameField = () => screen.getByLabelText(i18next.t('place.create.nameLabel')) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: i18next.t('place.edit.submit') }) as HTMLButtonElement;
const typeName = (value: string) => fireEvent.change(nameField(), { target: { value } });
const openOn = (placeId: string) => act(() => useEditPlaceDialogStore.getState().open(placeId));
const openId = () => useEditPlaceDialogStore.getState().placeId;
/** The dialog renders in a portal, so the hidden picker is looked up on the document. */
const pickPhoto = (file: File) =>
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
const photoOf = (bytes: number) => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: bytes });
    return file;
};

/** A promise the test settles by hand, to hold the dialog mid-request. */
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

beforeEach(() => {
    vi.clearAllMocks();
    updatePlace.mockResolvedValue(design);
    prepareImage.mockResolvedValue({ avatar: NEW_PHOTO });
    useEditPlaceDialogStore.setState({ placeId: 'place-1' });
});

describe('EditPlaceDialog', () => {
    it('opens on the place as it is, with nothing to save yet', () => {
        render(<EditPlaceDialog places={places} />);

        expect(nameField().value).toBe('Design');
        expect(nameField().maxLength).toBe(PLACE_NAME_MAX);
        // The place has a photo, so the form offers to change it rather than to add one.
        expect(screen.getByRole('button', { name: i18next.t('place.create.changePhoto') })).toBeTruthy();
        expect(saveButton().disabled).toBe(true);
    });

    it('sends only the trimmed new name when the photo was left alone, then closes', async () => {
        render(<EditPlaceDialog places={places} />);
        typeName('  Studio  ');
        fireEvent.click(saveButton());

        await waitFor(() => expect(openId()).toBeNull());
        expect(updatePlace).toHaveBeenCalledWith({ id: 'place-1', name: 'Studio' });
        expect(toast).toHaveBeenCalledWith({ description: i18next.t('place.edit.saved') });
    });

    it('sends only the photo when the name was left alone', async () => {
        render(<EditPlaceDialog places={places} />);
        pickPhoto(photoOf(1024));
        await waitFor(() => expect(saveButton().disabled).toBe(false));
        fireEvent.click(saveButton());

        await waitFor(() => expect(openId()).toBeNull());
        expect(updatePlace).toHaveBeenCalledWith({ id: 'place-1', thumbnail: NEW_PHOTO });
    });

    it('removes the photo by sending an empty one', async () => {
        render(<EditPlaceDialog places={places} />);
        fireEvent.click(screen.getByRole('button', { name: i18next.t('place.create.removePhoto') }));
        fireEvent.click(saveButton());

        await waitFor(() => expect(openId()).toBeNull());
        expect(updatePlace).toHaveBeenCalledWith({ id: 'place-1', thumbnail: '' });
    });

    it.each(['', '   '])('does not save an empty name (%j)', value => {
        render(<EditPlaceDialog places={places} />);
        typeName(value);
        expect(saveButton().disabled).toBe(true);
    });

    it('does not offer a save for a stored name that only carries spaces around it', () => {
        render(<EditPlaceDialog places={[{ ...design, name: ' Design ' }]} />);
        expect(saveButton().disabled).toBe(true);
    });

    it('does not offer a save when the name only gained spaces', () => {
        render(<EditPlaceDialog places={places} />);
        typeName(' Design ');
        expect(saveButton().disabled).toBe(true);
    });

    it('refuses a photo over the size cap before reading it', () => {
        render(<EditPlaceDialog places={places} />);
        pickPhoto(photoOf(PLACE_IMAGE_MAX_BYTES + 1));

        expect(prepareImage).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toBe(i18next.t('place.create.imageTooLarge', { max: 10 }));
    });

    it('holds the save while a photo is being read', async () => {
        const reading = deferred<{ avatar: string }>();
        prepareImage.mockReturnValue(reading.promise);
        render(<EditPlaceDialog places={places} />);
        typeName('Studio');
        pickPhoto(photoOf(1024));

        expect(saveButton().disabled).toBe(true);
        await act(async () => reading.resolve({ avatar: NEW_PHOTO }));
        expect(saveButton().disabled).toBe(false);
    });

    it('stays open and says a refusal is a refusal when the server denies the edit', async () => {
        updatePlace.mockRejectedValue(new Error('403 NOT ALLOWED - action[update] is invalid'));
        render(<EditPlaceDialog places={places} />);
        typeName('Studio');
        fireEvent.click(saveButton());

        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(i18next.t('place.edit.failed.denied')));
        expect(openId()).toBe('place-1');
        expect(nameField().value).toBe('Studio');
        expect(toast).not.toHaveBeenCalled();
    });

    it('sends one request when the save is submitted twice', async () => {
        const saving = deferred<DomainPlace>();
        updatePlace.mockReturnValue(saving.promise);
        render(<EditPlaceDialog places={places} />);
        typeName('Studio');
        const form = saveButton().closest('form') as HTMLFormElement;
        fireEvent.submit(form);
        fireEvent.submit(form);

        expect(updatePlace).toHaveBeenCalledTimes(1);
        await act(async () => saving.resolve(design));
    });

    it('closes on Escape while nothing is being saved', () => {
        render(<EditPlaceDialog places={places} />);
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

        expect(openId()).toBeNull();
    });

    it('ignores Escape while the save is running', async () => {
        const saving = deferred<DomainPlace>();
        updatePlace.mockReturnValue(saving.promise);
        render(<EditPlaceDialog places={places} />);
        typeName('Studio');
        fireEvent.click(saveButton());
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

        expect(openId()).toBe('place-1');
        await act(async () => saving.resolve(design));
    });

    it('closes when the place leaves the rail, and does not write to another one', () => {
        const { rerender } = render(<EditPlaceDialog places={places} />);
        typeName('Studio');
        rerender(<EditPlaceDialog places={[plain]} />);

        expect(openId()).toBeNull();
        expect(screen.queryByLabelText(i18next.t('place.create.nameLabel'))).toBeNull();
        expect(updatePlace).not.toHaveBeenCalled();
    });

    it('drops the answer of a save whose form was closed and reopened on another place', async () => {
        const saving = deferred<DomainPlace>();
        updatePlace.mockReturnValue(saving.promise);
        const { rerender } = render(<EditPlaceDialog places={places} />);
        typeName('Studio');
        fireEvent.click(saveButton());
        // The cloud changes under the dialog: the host closes it, and it is opened again elsewhere.
        act(() => useEditPlaceDialogStore.getState().close());
        rerender(<EditPlaceDialog places={places} />);
        openOn('place-2');

        await act(async () => saving.reject(new Error('500 INTERNAL')));
        expect(openId()).toBe('place-2');
        expect(nameField().value).toBe('Plain');
        expect(screen.queryByRole('alert')).toBeNull();
        expect(saveButton().disabled).toBe(true);
    });
});
