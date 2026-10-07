import { createUnconfirmedSource } from "../unconfirmed";

export const chulguk = createUnconfirmedSource({
  name: "chulguk",
  displayName: "출국의 신",
  checkUrl: "https://apps.apple.com/app/id6502391255",
  checkLabel: "앱에서 직접 확인",
  reason: "자동 조회 불가: 공식 API·Feed 및 약관상 자동 조회 허용 여부가 확인되지 않았습니다. 앱 중심 서비스로 확인되며 공개 웹 검색 페이지는 확인하지 못했습니다.",
  demo: undefined,
});
