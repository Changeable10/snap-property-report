import { useAdminTestPlan, setAdminTestPlan, useIsAdmin, PLAN_LABEL } from "@/lib/use-plan";

export function AdminTestBanner({ userId }: { userId: string | undefined }) {
  const { data: isAdmin } = useIsAdmin(userId);
  const testPlan = useAdminTestPlan();
  if (!isAdmin || !testPlan) return null;
  return (
    <div className="w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      Admin testing as <strong>{PLAN_LABEL[testPlan]}</strong>
      <button
        type="button"
        onClick={() => setAdminTestPlan(null)}
        className="ml-3 font-medium underline underline-offset-2 hover:text-amber-950"
      >
        Reset
      </button>
    </div>
  );
}