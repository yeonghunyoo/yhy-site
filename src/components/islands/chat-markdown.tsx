import type { ReactNode } from 'react';

// 챗 답변용 작은 마크다운 — 문단, "- " 글머리표, "1." 번호 목록, **굵게**, `코드`만 지원한다(docs/05-06-chat-rag.md 8층).
// HTML로 해석하지 않고 React 요소로만 만든다(dangerouslySetInnerHTML 없음). 그 밖의 표기(#, 링크, 표)는 글자로 둔다.
// 스트리밍 중 닫히지 않은 ** 나 ` 는 닫힐 때까지 글자로 보인다.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let i = 0;
  for (let m; (m = re.exec(text)); ) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] !== undefined ? (
        <strong key={`${key}-${i++}`} className="font-semibold">
          {m[1]}
        </strong>
      ) : (
        <code key={`${key}-${i++}`} className="rounded bg-bg px-1 font-mono text-[0.9em]">
          {m[2]}
        </code>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d{1,2}[.)]\s+(.*)$/;

export function ChatMarkdown({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const b = line.match(BULLET);
    const n = b ? null : line.match(NUMBER);
    const top = blocks.at(-1);
    if (b || n) {
      const kind = b ? 'ul' : 'ol';
      const item = (b ?? n)![1];
      if (top && top.kind === kind) top.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (!line.trim()) {
      blocks.push({ kind: 'p', lines: [] }); // 빈 줄 = 문단 나눔
    } else if (top && top.kind === 'p' && top.lines.length) {
      top.lines.push(line.trim());
    } else {
      blocks.push({ kind: 'p', lines: [line.trim()] });
    }
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        if (block.kind === 'p') {
          if (!block.lines.length) return null;
          return <p key={bi}>{inline(block.lines.join(' '), `p${bi}`)}</p>;
        }
        const List = block.kind === 'ul' ? 'ul' : 'ol';
        return (
          <List key={bi} className={`space-y-1 pl-5 ${block.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
            {block.items.map((item, ii) => (
              <li key={ii}>{inline(item, `l${bi}-${ii}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
