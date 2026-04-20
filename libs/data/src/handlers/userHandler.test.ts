import { userHandler } from './userHandler';
import { notifyAppUpdated } from '../sync-events';

jest.mock('../sync-events', () => ({
    notifyAppUpdated: jest.fn(),
}));

describe('userHandler', () => {
    const mockCloudId = 'test-cloud';
    let mockUserRepo: any;
    let mockPlaceRepo: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUserRepo = { saveUser: jest.fn() };
        mockPlaceRepo = { savePlaces: jest.fn(), savePlace: jest.fn() };
    });

    describe('사이트(Place) 관련 처리', () => {
        it('my-site 액션: 사이트 목록에 cid를 주입하여 병렬 저장하고 이벤트를 방출한다', async () => {
            const mockEnvelope = {
                action: 'my-site',
                payload: { list: [{ id: 'site-1', name: 'Site A' }] },
            } as any;

            await userHandler(mockEnvelope, mockCloudId, mockUserRepo, mockPlaceRepo);

            expect(mockPlaceRepo.savePlaces).toHaveBeenCalledWith([{ id: 'site-1', name: 'Site A', cid: mockCloudId }]);
            expect(notifyAppUpdated).toHaveBeenCalledWith(
                expect.objectContaining({
                    domain: 'site',
                    action: 'my-site',
                })
            );
        });

        it('make-site 및 update-site 액션: 단일 사이트에 cid를 주입하여 저장한다', async () => {
            const actions = ['make-site', 'update-site'];

            for (const action of actions) {
                const mockEnvelope = {
                    action,
                    payload: { site$: { id: `site-${action}`, name: 'Test' } },
                } as any;

                await userHandler(mockEnvelope, mockCloudId, mockUserRepo, mockPlaceRepo);

                expect(mockPlaceRepo.savePlace).toHaveBeenCalledWith(`site-${action}`, {
                    id: `site-${action}`,
                    name: 'Test',
                    cid: mockCloudId,
                });
            }
        });
    });

    describe('유저 및 프로필 관련 처리', () => {
        it('update-profile 및 invite 액션: 유저 정보를 로컬 DB에 저장한다', async () => {
            const actions = ['update-profile', 'invite'];

            for (const action of actions) {
                const mockEnvelope = {
                    action,
                    payload: { user$: { id: `user-${action}`, name: 'DoU' } },
                } as any;

                await userHandler(mockEnvelope, mockCloudId, mockUserRepo, mockPlaceRepo);

                expect(mockUserRepo.saveUser).toHaveBeenCalledWith({
                    id: `user-${action}`,
                    name: 'DoU',
                });
                expect(notifyAppUpdated).toHaveBeenCalledWith(
                    expect.objectContaining({
                        domain: 'user',
                        action,
                        targetId: `user-${action}`,
                    })
                );
            }
        });
    });

    describe('에러 처리', () => {
        it('error 액션: 에러 페이로드를 error 도메인으로 방출한다', async () => {
            const mockEnvelope = {
                action: 'error',
                payload: { error: 'unauthorized' },
            } as any;

            await userHandler(mockEnvelope, mockCloudId, mockUserRepo, mockPlaceRepo);

            expect(notifyAppUpdated).toHaveBeenCalledWith(
                expect.objectContaining({
                    domain: 'error',
                    action: 'error',
                    cid: mockCloudId,
                })
            );
        });
    });
});
