import { getStore } from "../../../lib/runtime";

export async function GET() {
  return Response.json((await getStore()).metrics());
}
