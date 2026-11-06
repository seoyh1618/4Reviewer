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
          title="내 정보 관리"
          subtitle="이름과 플랫폼별로 정보를 묶어 간편하게 관리하세요."
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
