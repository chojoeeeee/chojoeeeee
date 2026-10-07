import { createUnconfirmedSource } from "../unconfirmed";

export const aliFlight = createUnconfirmedSource({
  name: "ali-flight",
  displayName: "알리항공권",
  checkUrl: "https://www.aliexpress.com",
  checkLabel: "사이트에서 직접 확인",
  reason: "자동 조회 불가: 공식 API·Feed 및 약관상 자동 조회 허용 여부가 확인되지 않았습니다. AliExpress Travel(Fliggy 연동)로 보이나 항공권 API/제휴는 확인되지 않았습니다.",
  demo: { flightBias: 1.12 },
});
