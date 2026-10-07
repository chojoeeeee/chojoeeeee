import { createDealStub } from "../deal-stub";

export const aliFlightProvider = createDealStub({
  name: "ali-flight",
  displayName: "알리항공권",
  status: "unavailable",
  message: "공식 API/Feed/약관 허용 여부 미확인 — 연동 보류 (특가 Feed는 Phase 3)",
});
