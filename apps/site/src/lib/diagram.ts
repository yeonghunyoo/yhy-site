// 흐름도 데이터(서버 흐름도 에이전트 → SSE `diagram` 이벤트 → 챗 독 렌더러). docs/05-06-chat-rag.md "흐름도 에이전트".

export interface DiagramNode {
  id: string;
  label: string;
  /** 같은 묶음끼리 같은 색 */
  group?: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Diagram {
  direction: 'TB' | 'LR';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export const DIAGRAM_LIMITS = { nodes: 14, edges: 20, label: 28 } as const;
