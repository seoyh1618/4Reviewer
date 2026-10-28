import { z } from "zod";

export const templateTypes = ["텍스트 리뷰", "사진 리뷰"];
export const templateGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "그룹 이름을 입력해 주세요.")
    .max(40, "그룹 이름은 40자 이내로 입력해 주세요."),
});
export const templateSchema = z.object({
  groupId: z.union([z.literal(""), z.uuid()]).default(""),
  title: z
    .string()
    .trim()
    .min(1, "템플릿 이름을 입력해 주세요.")
    .max(60, "이름은 60자 이내로 입력해 주세요."),
  reviewType: z.enum(["텍스트 리뷰", "사진 리뷰"]),
  content: z
    .string()
    .trim()
    .min(1, "리뷰 내용을 입력해 주세요.")
    .max(5000, "내용은 5,000자 이내로 입력해 주세요."),
});

// Shared starting points are read-only. Each account saves its own overrides.
export const starterTemplates = [
  {
    id: "starter-basic",
    title: "간단한 사용 후기",
    reviewType: "텍스트 리뷰",
    content:
      "[상품명]을 [구매 이유] 때문에 선택했어요.\n[사용 기간] 동안 사용해 보니 [직접 느낀 점]이 인상적이었어요.\n좋았던 점은 [장점], 아쉬웠던 점은 [아쉬운 점]이에요.\n[어떤 상황이나 용도]로 사용하실 분들이 참고하시면 좋겠어요.",
  },
  {
    id: "starter-photo",
    title: "사진과 함께 남기는 후기",
    reviewType: "사진 리뷰",
    content:
      "[상품명]을 직접 사용한 모습을 사진으로 남겨봤어요.\n\n• 구성과 외관: [구성품, 색상, 크기 등 실제로 확인한 내용]\n• 사용 모습: [사진 속 사용 상황과 방법]\n• 사용 후 느낀 점: [만족한 점과 아쉬운 점]\n\n사진은 [촬영 환경]에서 촬영했으니 색상과 크기를 참고해 주세요.",
  },
  {
    id: "starter-food",
    title: "식품 · 간식 후기",
    reviewType: "텍스트 리뷰",
    content:
      "[상품명]을 [먹은 방법이나 조리 방법]으로 먹어봤어요.\n\n맛과 향: [직접 느낀 맛과 향]\n식감: [부드러움, 바삭함 등 실제 식감]\n양과 포장: [양, 소분 여부, 받은 상태]\n\n개인적으로 [좋았던 점]이 좋았고, [아쉬운 점]은 참고하시면 좋겠어요.\n다음에는 [곁들일 음식이나 활용 방법]으로 먹어보려고 해요.",
  },
  {
    id: "starter-beauty",
    title: "뷰티 · 사용감 후기",
    reviewType: "사진 리뷰",
    content:
      "제 피부 타입은 [피부 타입]이고, [상품명]을 [사용 기간과 빈도] 사용했어요.\n\n제형과 향: [직접 확인한 제형과 향]\n발림성과 마무리: [펴 바를 때와 바른 뒤의 느낌]\n사용 후 느낌: [개인적으로 느낀 변화 또는 차이가 없었던 점]\n\n[좋았던 점 / 아쉬웠던 점]을 함께 남겨요.\n사용감은 피부 타입과 사용 환경에 따라 다를 수 있어요.",
  },
  {
    id: "starter-living",
    title: "생활용품 · 실사용 후기",
    reviewType: "텍스트 리뷰",
    content:
      "[사용 장소나 용도]에 쓰려고 [상품명]을 구매했어요.\n\n크기와 구성: [실측 크기, 구성품, 설치 공간]\n사용 편의성: [설치, 조작, 세척 등 직접 해본 내용]\n실사용 후기: [사용하면서 편했던 점과 불편했던 점]\n\n구매 전에 [확인하면 좋을 치수나 조건]을 확인하시면 도움이 될 것 같아요.",
  },
  {
    id: "starter-month",
    title: "한 달 사용 후기",
    reviewType: "텍스트 리뷰",
    content:
      "[상품명]을 [실제 사용 기간] 동안 [사용 빈도] 사용한 후기예요.\n\n처음과 비교하면: [처음 기대와 현재 느낌의 차이]\n계속 좋았던 점: [시간이 지나도 만족한 부분]\n새로 알게 된 점: [관리 방법, 불편함, 마모 등]\n\n재구매 의향은 [있음 / 없음 / 고민 중]이고, 이유는 [실제 이유]예요.",
  },
];
