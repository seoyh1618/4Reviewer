import { Plus, SlidersHorizontal } from "lucide-react";
import RegistrationDefaultsForm from "./RegistrationDefaultsForm";
import { Button, PageHeading } from "./ui";

export default function RegistrationDefaultsPage({
  onAdd,
}: {
  onAdd: () => void;
}) {
  return (
    <section className="registration-defaults-page">
      <div className="page-title">
        <PageHeading
          icon={SlidersHorizontal}
          title="자동입력 설정"
          subtitle="상품 등록에 자주 사용하는 정보와 자동 채움 항목을 관리하세요."
        />
        <Button onClick={onAdd}>
          <Plus size={17} />
          상품 등록
        </Button>
      </div>
      <div className="panel registration-defaults-panel">
        <RegistrationDefaultsForm />
      </div>
    </section>
  );
}
