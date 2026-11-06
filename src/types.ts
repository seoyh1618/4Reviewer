export type Review = {
  id: string;
  name: string;
  sku: string;
  orderNumber: string;
  purchaser: string;
  seller: string;
  platform: string;
  platformOther: string;
  shippingMethod: "실배송" | "빈박스" | "";
  price: number;
  expectedPayback: number;
  paybackMode: "shipping" | "purchase" | "custom";
  additionalReviewFee: number;
  receivedAmount: number;
  purchaseDate: string;
  dueDate: string;
  reviewedAt: string;
  reviewType: string;
  reviewStatus: "todo" | "done";
  paidAt: string;
  contact: string;
  kakaoName: string;
  depositor: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};
export type ReviewInput = Omit<
  Review,
  "id" | "createdAt" | "updatedAt" | "version"
>;
export type User = {
  id: string;
  email: string | null;
  username: string | null;
  isAdmin?: boolean;
};
export type RegistrationDefaultKey =
  | "purchaser"
  | "platform"
  | "shippingMethod"
  | "reviewType"
  | "additionalReviewFee";
export type RegistrationDefaults = {
  values: Pick<ReviewInput, RegistrationDefaultKey | "platformOther">;
  enabledFields: RegistrationDefaultKey[];
  version: number;
  updatedAt: string | null;
};
export type Activity = {
  id: string;
  reviewId: string;
  label: string;
  amount: number;
  createdAt: string;
};
export type RegistrationProfileDetails = {
  phone: string;
  address: string;
  email: string;
  bank: string;
  accountNumber: string;
  accountHolder: string;
};
export type RegistrationProfile = RegistrationDefaults & {
  id: string;
  details: RegistrationProfileDetails;
  isDefault: boolean;
  createdAt: string;
};
export type RegistrationProfileInput = Pick<
  RegistrationProfile,
  "values" | "enabledFields" | "details" | "version"
> & { makeDefault: boolean };
export type Payment = { reviewId: string; amount: number; paidAt: string };
export type Page =
  | "dashboard"
  | "products"
  | "calendar"
  | "payback"
  | "insights"
  | "templates"
  | "admin"
  | "defaults";
export type ReviewTemplateInput = {
  groupId: string;
  title: string;
  reviewType: "텍스트 리뷰" | "사진 리뷰";
  content: string;
};
export type TemplateGroup = {
  id: string;
  name: string;
  createdAt: string;
};
export type ReviewTemplate = ReviewTemplateInput & {
  id: string;
  isStarter: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;
};
export type Filters = {
  search: string;
  platform: string;
  shippingMethod: string;
  status: string;
  sort: string;
};
