import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dbPath = join(root, "fixtures", "datasette", "demo.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

const sql = `
drop table if exists demo_metrics;
create table demo_metrics (
  id integer primary key,
  metric text not null,
  value real not null
);
insert into demo_metrics(metric, value) values
  ('adapter_count', 10),
  ('target_budget_usdc', 0.05),
  ('judging_circle_tools_percent', 20),
  ('judging_traction_percent', 30);
`;

const result = spawnSync("sqlite3", [dbPath, sql], { stdio: "inherit" });
if (result.error) {
  console.error("sqlite3 is required to create the Datasette fixture.");
  process.exit(1);
}
process.exit(result.status ?? 0);
