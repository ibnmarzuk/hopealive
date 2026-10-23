import { randomUUID } from "node:crypto";
import postgres from "postgres";

if (process.env.VERCEL_ENV !== "production") process.exit(0);

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("[Database] Production deployment is missing DATABASE_URL or POSTGRES_URL.");
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 10 });
try {
  await sql.begin(async tx => {
    const classGroup = `health-${randomUUID()}`;
    await tx`insert into registration_counters ("classGroup", "lastNumber") values (${classGroup}, 0)`;
    const [initial] = await tx`select "lastNumber" from registration_counters where "classGroup" = ${classGroup} for update`;
    if (Number(initial?.lastNumber) !== 0) throw new Error("Database smoke test could not read the inserted counter.");
    await tx`update registration_counters set "lastNumber" = 1 where "classGroup" = ${classGroup}`;
    const [updated] = await tx`select "lastNumber" from registration_counters where "classGroup" = ${classGroup}`;
    if (Number(updated?.lastNumber) !== 1) throw new Error("Database smoke test could not read back the updated counter.");
    await tx`delete from registration_counters where "classGroup" = ${classGroup}`;
  });
  console.log("[Database] Production database read/write smoke test passed.");
} finally {
  await sql.end({ timeout: 5 });
}
