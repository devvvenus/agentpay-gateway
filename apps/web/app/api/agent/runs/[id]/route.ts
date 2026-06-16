import { getStore, jsonError } from "../../../../../lib/runtime";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const run = store.getRun(id);
  if (!run) return jsonError("Run not found", 404);
  return Response.json({
    run,
    decisions: store.listDecisions(id),
    steps: store.listSteps(id)
  });
}
