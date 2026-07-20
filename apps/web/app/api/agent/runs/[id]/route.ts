import { canViewSensitiveRuntimeData, getStore, jsonError } from "../../../../../lib/runtime";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const run = store.getRun(id);
  if (!run) return jsonError("Run not found", 404);
  if (!canViewSensitiveRuntimeData(request)) {
    return Response.json({
      run: {
        id: run.id,
        status: run.status,
        budgetUsdc: run.budgetUsdc,
        totalSpendUsdc: run.totalSpendUsdc,
        createdAt: run.createdAt,
        completedAt: run.completedAt
      }
    });
  }
  return Response.json({
    run,
    decisions: store.listDecisions(id),
    steps: store.listSteps(id)
  });
}
