import { createUnconfirmedSource } from "../unconfirmed";

export const playwings = createUnconfirmedSource({
  name: "playwings",
  displayName: "플레이윙즈 (Playwings)",
  checkUrl: "https://www.playwings.co.kr",
  checkLabel: "플레이윙즈에서 직접 확인",
  reason:
    "특가 콘텐츠 중심 서비스로 공개 특가 Feed·API가 확인되지 않았고 자동 수집 허용 여부도 미확인이라 자동 조회를 하지 않습니다. 공식 사이트에서 직접 확인해주세요.",
  demo: { deals: true },
});
