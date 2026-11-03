// 챗 답변 표시용 문자열 처리. 모델은 답 끝 줄에 출처를 [[slug]]로 단다("[[resume]], [[forest]]" 등) —
// 화면에는 출처 칩으로 따로 보여주므로 본문에서는 출처 표기와 그 구분자(쉼표·가운뎃점·빗금·"출처:")까지 지운다.

const SEP = '[\\s,，、·・/|]';
// 출처만 있는 끝 줄(라벨 포함). 스트리밍 중 반쯤 온 "[[res"도 포함
const TRAILING_LINE = new RegExp(
  `(?:^|\\n)[ \\t]*(?:(?:출처|참고|sources?|references?)[ \\t]*[:：]?[ \\t]*)?(?:\\[\\[[^\\]\\n]*(?:\\]\\]?)?${SEP}*)+$`,
  'i',
);
// 본문 중간에 붙은 표기와 그 앞 구분자
const INLINE = new RegExp(`${SEP}*\\[\\[[^\\]\\n]*\\]\\]`, 'g');
const PARTIAL = /\[\[?[^\]\n]*$/;

export function visibleAnswer(text: string): string {
  return text
    .replace(TRAILING_LINE, '')
    .replace(INLINE, '')
    .replace(PARTIAL, '')
    .replace(/[\s,，、·・/|]+$/, '')
    .trim();
}
