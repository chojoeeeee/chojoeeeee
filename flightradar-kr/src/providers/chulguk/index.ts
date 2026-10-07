import { createUnconfirmedSource } from "../unconfirmed";

export const chulguk = createUnconfirmedSource({
  name: "chulguk",
  displayName: "출국의 신",
  checkUrl: "https://godflight.com",
  checkLabel: "출국의 신에서 직접 확인",
  reason:
    "공식 웹(godflight.com)은 확인했지만 공개 API가 없고 자동 수집 허용 여부(약관·robots)가 미확인이라 자동 조회를 하지 않습니다. 이 서비스는 출발 7일 이내 땡처리 목록이라 먼 날짜 검색에는 결과가 없을 수 있습니다.",
  demo: undefined,
});
