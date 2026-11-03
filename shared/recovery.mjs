export const recoveryQuestions = [
  { id: "secret_phrase", label: "나만 기억하는 문구는 무엇인가요?" },
  { id: "childhood_object", label: "어릴 때 아끼던 물건의 별명은 무엇인가요?" },
  { id: "memorable_place", label: "나만의 추억이 있는 장소는 어디인가요?" },
];
export const normalizeAnswer = (value) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export const normalizeRecoveryCode = (value) =>
  value.replace(/[\s-]/g, "").toLowerCase();
