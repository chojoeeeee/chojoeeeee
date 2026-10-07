import { createUnconfirmedSource } from "../unconfirmed";

export const catchfrog = createUnconfirmedSource({
  name: "catchfrog",
  displayName: "캐치프로그",
  checkUrl: "https://catchfrog.ai",
  checkLabel: "캐치프로그에서 직접 확인",
  reason:
    "공개 API·Feed가 확인되지 않았고 자동 수집 허용 여부(약관·robots)도 미확인이라 자동 조회를 하지 않습니다. 공식 사이트에서 직접 확인해주세요.",
  demo: { flightBias: 1.07 },
});
