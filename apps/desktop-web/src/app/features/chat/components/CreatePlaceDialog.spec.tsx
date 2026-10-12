import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';

import type * as ChaticSharedModule from '@chatic/shared';

import type * as SharedModule from '../../../shared';

const prepareImage = vi.hoisted(() => vi.fn());
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<typeof ChaticSharedModule>('@chatic/shared')),
    prepareImage,
}));

const createPlace = vi.hoisted(() => vi.fn());
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useCreatePlace: () => ({ createPlace }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import '../../../../i18n';
import { useCreatePlaceDialogStore } from '../stores';
import { PLACE_IMAGE_MAX_BYTES, PLACE_NAME_MAX } from '../utils';
import { CreatePlaceDialog } from './CreatePlaceDialog';

const onEnter = vi.fn();
const onEntered = vi.fn();

const nameField = () => screen.getByLabelText(i18next.t('place.create.nameLabel')) as HTMLInputElement;
const submitButton = () => screen.getByRole('button', { name: i18next.t('place.create.submit') });
const typeName = (value: string) => fireEvent.change(nameField(), { target: { value } });
const isOpen = () => useCreatePlaceDialogStore.getState().isOpen;

const PHOTO = 'data:image/jpeg;base64,AAAA';
/** The dialog renders in a portal, so the hidden picker is looked up on the document. */
const pickPhoto = (file: File) =>
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
const photoOf = (bytes: number) => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: bytes });
    return file;
};
const photoButton = () => screen.getByRole('button', { name: i18next.t('place.create.photo') });
const removeButton = () => screen.queryByRole('button', { name: i18next.t('place.create.removePhoto') });

/** A promise the test settles by hand, to hold the dialog mid-request. */
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => (resolve = r));
    return { promise, resolve };
};

beforeEach(() => {
    vi.clearAllMocks();
    createPlace.mockResolvedValue({ id: 'place-9', name: 'Design' });
    onEnter.mockResolvedValue(undefined);
    prepareImage.mockResolvedValue({ avatar: PHOTO });
    useCreatePlaceDialogStore.setState({ isOpen: true });
});

describe('CreatePlaceDialog', () => {
    it('creates the place under its trimmed name, enters it, then closes', async () => {
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('  Design  ');
        fireEvent.click(submitButton());

        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace).toHaveBeenCalledWith({ name: 'Design' });
        expect(onEnter).toHaveBeenCalledWith('place-9');
        expect(toast).toHaveBeenCalledWith({ description: i18next.t('place.create.created') });
    });

    it('does not submit a name that is only spaces', () => {
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('   ');

        expect(submitButton()).toHaveProperty('disabled', true);
        fireEvent.submit(nameField());
        expect(createPlace).not.toHaveBeenCalled();
    });

    it('caps the name at the length the mobile app applies', () => {
        render(<CreatePlaceDialog onEnter={onEnter} />);
        expect(nameField().maxLength).toBe(PLACE_NAME_MAX);
    });

    it.each([
        [new Error('403 NOT ALLOWED - action[create] is invalid'), 'place.create.failed.denied'],
        [new Error('Network timeout'), 'errors.network'],
        [new Error('500 INTERNAL'), 'place.create.failed'],
    ])('says why the place was not made (%s)', async (error, key) => {
        createPlace.mockRejectedValueOnce(error);
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        fireEvent.click(submitButton());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe(i18next.t(key));
        expect(onEnter).not.toHaveBeenCalled();
        expect(isOpen()).toBe(true);
    });

    // A plain resubmit after a failed switch would make a twin of the place that already exists.
    it('retries only the switch when the place was made but could not be entered', async () => {
        onEnter.mockRejectedValueOnce(new Error('switch failed'));
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        fireEvent.click(submitButton());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe(i18next.t('place.create.enterFailed'));
        expect(isOpen()).toBe(true);
        expect(nameField().disabled).toBe(true);
        expect(photoButton()).toHaveProperty('disabled', true);

        fireEvent.click(submitButton());

        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace).toHaveBeenCalledTimes(1);
        expect(onEnter).toHaveBeenCalledTimes(2);
        expect(onEnter).toHaveBeenLastCalledWith('place-9');
    });

    it('makes one place however many times the form is submitted while it runs', async () => {
        const pending = deferred<{ id: string }>();
        createPlace.mockReturnValueOnce(pending.promise);
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        const form = nameField().closest('form') as HTMLFormElement;

        fireEvent.submit(form);
        fireEvent.submit(form);
        pending.resolve({ id: 'place-9' });

        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace).toHaveBeenCalledTimes(1);
    });

    it('ignores Escape while the place is being made', async () => {
        const pending = deferred<{ id: string }>();
        createPlace.mockReturnValueOnce(pending.promise);
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        fireEvent.click(submitButton());

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(isOpen()).toBe(true);

        pending.resolve({ id: 'place-9' });
        await waitFor(() => expect(isOpen()).toBe(false));
    });

    it('opens empty again after it was closed on a failure', async () => {
        onEnter.mockRejectedValueOnce(new Error('switch failed'));
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        fireEvent.click(submitButton());
        await screen.findByRole('alert');

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(isOpen()).toBe(false);
        act(() => useCreatePlaceDialogStore.setState({ isOpen: true }));

        expect(nameField().value).toBe('');
        expect(nameField().disabled).toBe(false);
        expect(screen.queryByRole('alert')).toBeNull();

        // The earlier place is not the retry target any more: a new name makes a new place.
        typeName('Research');
        fireEvent.click(submitButton());
        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace).toHaveBeenCalledTimes(2);
        expect(createPlace).toHaveBeenLastCalledWith({ name: 'Research' });
    });

    it('forgets a place it could not enter when it is closed from outside', async () => {
        onEnter.mockRejectedValueOnce(new Error('switch failed'));
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        fireEvent.click(submitButton());
        await screen.findByRole('alert');

        act(() => useCreatePlaceDialogStore.setState({ isOpen: false }));
        act(() => useCreatePlaceDialogStore.setState({ isOpen: true }));

        expect(nameField().value).toBe('');
        expect(nameField().disabled).toBe(false);
    });

    // The host closes the dialog when the cloud changes under it. A request still in flight then
    // answers for the cloud that was left: entering its place would move the session there.
    it('drops a request that answers after the dialog was closed from outside', async () => {
        const pending = deferred<{ id: string }>();
        createPlace.mockReturnValueOnce(pending.promise);
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        fireEvent.click(submitButton());

        act(() => useCreatePlaceDialogStore.setState({ isOpen: false }));
        await act(async () => {
            pending.resolve({ id: 'place-9' });
            await pending.promise;
        });

        expect(onEnter).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();

        act(() => useCreatePlaceDialogStore.setState({ isOpen: true }));
        expect(nameField().value).toBe('');
        expect(nameField().disabled).toBe(false);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('sends the picked photo as the thumbnail of the place', async () => {
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        pickPhoto(photoOf(1024));
        await waitFor(() => expect(removeButton()).not.toBeNull());
        fireEvent.click(submitButton());

        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace).toHaveBeenCalledWith({ name: 'Design', thumbnail: PHOTO });
    });

    it('makes the place without a photo once the picked one is removed', async () => {
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        pickPhoto(photoOf(1024));
        await waitFor(() => expect(removeButton()).not.toBeNull());
        fireEvent.click(removeButton() as HTMLElement);
        fireEvent.click(submitButton());

        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace.mock.calls[0][0].thumbnail).toBeUndefined();
    });

    it('refuses a photo over the size cap without trying to encode it', async () => {
        render(<CreatePlaceDialog onEnter={onEnter} />);
        pickPhoto(photoOf(PLACE_IMAGE_MAX_BYTES + 1));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe(i18next.t('place.create.imageTooLarge', { max: 10 }));
        expect(prepareImage).not.toHaveBeenCalled();
        expect(removeButton()).toBeNull();
    });

    it.each([
        ['the encoder throws', () => prepareImage.mockRejectedValueOnce(new Error('decode failed'))],
        ['the encoder returns nothing', () => prepareImage.mockResolvedValueOnce({ avatar: '' })],
    ])('says the photo could not be used when %s', async (_case, arrange) => {
        arrange();
        render(<CreatePlaceDialog onEnter={onEnter} />);
        pickPhoto(photoOf(1024));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe(i18next.t('place.create.imageFailed'));
        expect(removeButton()).toBeNull();
    });

    // A place made mid-encode would go out without the photo the form is about to show.
    it('holds the submit until the picked photo is ready', async () => {
        const encoding = deferred<{ avatar: string }>();
        prepareImage.mockReturnValueOnce(encoding.promise);
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        pickPhoto(photoOf(1024));

        expect(submitButton()).toHaveProperty('disabled', true);
        fireEvent.submit(nameField().closest('form') as HTMLFormElement);
        expect(createPlace).not.toHaveBeenCalled();

        await act(async () => {
            encoding.resolve({ avatar: PHOTO });
            await encoding.promise;
        });
        fireEvent.click(submitButton());

        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace).toHaveBeenCalledWith({ name: 'Design', thumbnail: PHOTO });
    });

    it('keeps the photo picked before when the next one cannot be used', async () => {
        render(<CreatePlaceDialog onEnter={onEnter} />);
        typeName('Design');
        pickPhoto(photoOf(1024));
        await waitFor(() => expect(removeButton()).not.toBeNull());

        pickPhoto(photoOf(PLACE_IMAGE_MAX_BYTES + 1));
        await screen.findByRole('alert');
        fireEvent.click(submitButton());

        await waitFor(() => expect(isOpen()).toBe(false));
        expect(createPlace).toHaveBeenCalledWith({ name: 'Design', thumbnail: PHOTO });
    });

    // What follows the entry writes into the place the session is in, so it must not run early.
    it('reports the place as entered only after the switch into it resolved', async () => {
        const entering = deferred<void>();
        onEnter.mockReturnValueOnce(entering.promise);
        render(<CreatePlaceDialog onEnter={onEnter} onEntered={onEntered} />);
        typeName('Design');
        fireEvent.click(submitButton());

        await waitFor(() => expect(onEnter).toHaveBeenCalledWith('place-9'));
        expect(onEntered).not.toHaveBeenCalled();

        entering.resolve();
        await waitFor(() => expect(onEntered).toHaveBeenCalledWith('place-9'));
    });

    it('does not report a place it could not enter', async () => {
        onEnter.mockRejectedValueOnce(new Error('switch failed'));
        render(<CreatePlaceDialog onEnter={onEnter} onEntered={onEntered} />);
        typeName('Design');
        fireEvent.click(submitButton());

        await screen.findByRole('alert');
        expect(onEntered).not.toHaveBeenCalled();
    });
});
