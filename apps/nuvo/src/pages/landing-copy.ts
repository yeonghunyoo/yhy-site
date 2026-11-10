import type { IconName } from "../components/icon-paths";

/**
 * 랜딩 문구 한 곳 (React 랜딩 화면과, 빌드 때 만드는 정적 랜딩·메타·JSON-LD·llms.txt가 함께 쓴다 — seo/plugin.ts).
 * 스크립트 없이도 검색엔진·AI 크롤러가 같은 글을 보게 하려는 것 (docs/seo.md 4·5).
 * 문구를 지금 방향(한 명 구독, 가족이 함께 보는 비공개 앨범)으로 바꾸는 일은 가격·약관 결정과 함께 (docs/seo.md 순서 2)
 */
export const LANDING = {
  /** 브라우저 탭·검색 결과 제목 (40자 이하) */
  title: "nuvo · 가족 사진을 한곳에",
  /** 검색 결과 설명 (40~120자) */
  description: "흩어진 사진을 한곳에 모아 보고, 가족과 함께 쌓아가는 비공개 사진 서비스. 초대받은 사람만 볼 수 있어요.",
  /** 공유 미리보기 설명 (조금 짧게) */
  shareDescription: "흩어진 사진을 한곳에 모아 보고, 가족과 함께 쌓아가는 비공개 사진 서비스.",
  heading: { lead: "흩어진 사진을,", accent: "한곳에." },
  lead: "PC, 클라우드, 가족의 휴대폰에 흩어진 사진을 모으고 함께 쌓아가세요.",
  features: [
    { icon: "laptop", title: "PC 사진은 그대로", body: "폴더를 연결하면 업로드 없이 바로 모아 봐요. 원본은 PC를 떠나지 않아요." },
    { icon: "users", title: "가족과 함께 쌓기", body: "초대 링크 하나로 모두가 같은 앨범에 사진을 올리고, 새 사진은 바로 알려줘요." },
    { icon: "layers", title: "중복은 알아서", body: "카톡으로 돌고 돈 같은 사진을 찾아 가장 선명한 한 장만 남겨요." },
  ] satisfies { icon: IconName; title: string; body: string }[],
  footer: "nuvo · 사진은 비공개가 기본이에요. 초대받은 사람만 볼 수 있어요.",
  cta: { start: "시작하기", localOnly: "로그인 없이 내 PC 사진 보기", signIn: "로그인" },
} as const;
