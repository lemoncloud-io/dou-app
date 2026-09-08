import { hasAttachmentContent, resolveAttachmentAccent, safeAttachmentUrl } from './chatAttachment';

describe('safeAttachmentUrl — 원문 링크 스킴 검증', () => {
    it('http/https는 그대로 통과한다', () => {
        expect(safeAttachmentUrl('https://example.com/report/1')).toBe('https://example.com/report/1');
        expect(safeAttachmentUrl('http://example.com')).toBe('http://example.com');
    });

    // 첨부 본문은 서버가 해석하지 않고 보존하는 webhook 입력이고, 이 값은 네이티브 셸에서 OS
    // 브라우저로 그대로 넘어간다 — 스킴을 거르지 않으면 href가 실행 경로가 된다.
    it('실행 가능한 스킴은 버린다', () => {
        expect(safeAttachmentUrl('javascript:alert(1)')).toBeUndefined();
        expect(safeAttachmentUrl('data:text/html,<script>')).toBeUndefined();
        expect(safeAttachmentUrl('file:///etc/passwd')).toBeUndefined();
    });

    it('절대 URL이 아니면 보낼 곳이 없다', () => {
        expect(safeAttachmentUrl('/report/1')).toBeUndefined();
        expect(safeAttachmentUrl('example.com')).toBeUndefined();
    });

    it('비어 있으면 undefined다', () => {
        expect(safeAttachmentUrl(undefined)).toBeUndefined();
        expect(safeAttachmentUrl('   ')).toBeUndefined();
    });
});

describe('hasAttachmentContent — 그릴 것이 있는가', () => {
    it('필드가 하나라도 차 있으면 그린다', () => {
        expect(hasAttachmentContent({ title: '오류' })).toBe(true);
        expect(hasAttachmentContent({ text: '본문' })).toBe(true);
        expect(hasAttachmentContent({ pretext: '출처' })).toBe(true);
        expect(hasAttachmentContent({ username: 'hello-alarm' })).toBe(true);
        expect(hasAttachmentContent({ footer: 'api#1.0' })).toBe(true);
        expect(hasAttachmentContent({ fields: [{ title: 'code', value: 500 }] })).toBe(true);
        expect(hasAttachmentContent({ sourceUrl: 'https://example.com' })).toBe(true);
    });

    // 서버가 보존만 하므로 `{}`나 공백만 든 첨부가 올 수 있다 — 빈 카드보다 안 그리는 게 낫다.
    it('비었거나 공백뿐이면 그리지 않는다', () => {
        expect(hasAttachmentContent(undefined)).toBe(false);
        expect(hasAttachmentContent(null)).toBe(false);
        expect(hasAttachmentContent({})).toBe(false);
        expect(hasAttachmentContent({ title: '   ', text: '' })).toBe(false);
        expect(hasAttachmentContent({ fields: [] })).toBe(false);
    });

    // 링크만 든 첨부라도, 그 링크를 못 쓰면 카드에 남는 게 없다.
    it('쓸 수 없는 링크만 있으면 그리지 않는다', () => {
        expect(hasAttachmentContent({ sourceUrl: 'javascript:alert(1)' })).toBe(false);
    });
});

describe('resolveAttachmentAccent — 심각도 색', () => {
    it('세 단어를 토큰으로 매핑한다', () => {
        expect(resolveAttachmentAccent('danger')).toBe('hsl(var(--destructive))');
        expect(resolveAttachmentAccent('good')).toBe('hsl(var(--main-accent))');
        expect(resolveAttachmentAccent('warning')).toBe('#F5A623');
    });

    it('대소문자와 공백은 무시한다', () => {
        expect(resolveAttachmentAccent('  DANGER ')).toBe('hsl(var(--destructive))');
    });

    it('hex는 발신자 의도이므로 그대로 쓴다', () => {
        expect(resolveAttachmentAccent('#ff0000')).toBe('#ff0000');
        expect(resolveAttachmentAccent('#F00')).toBe('#f00');
    });

    // 모르는 값에 색을 지어내면 심각도를 잘못 말하게 되고, 빈 값을 두면 레일이 사라진다.
    it('모르는 값과 빈 값은 중립 테두리로 떨어진다', () => {
        expect(resolveAttachmentAccent('chartreuse')).toBe('hsl(var(--input-border))');
        expect(resolveAttachmentAccent('#12345')).toBe('hsl(var(--input-border))');
        expect(resolveAttachmentAccent(undefined)).toBe('hsl(var(--input-border))');
    });
});
