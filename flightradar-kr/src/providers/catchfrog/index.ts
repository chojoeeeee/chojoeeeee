import { createUnconfirmedSource } from "../unconfirmed";

export const catchfrog = createUnconfirmedSource({
  name: "catchfrog",
  displayName: "캐치프로그",
  checkUrl: "https://apps.apple.com/app/id6737223338",
  checkLabel: "앱에서 직접 확인",
  reason: "자동 조회 불가: 공식 API·Feed 및 약관상 자동 조회 허용 여부가 확인되지 않았습니다. 앱 중심 서비스로 확인됩니다.",
  demo: { flightBias: 1.07 },
});
