import { currentDriver, newToken, sha256 } from "@/lib/auth";
import { sql } from "@/lib/db";

// Personal upload tokens for the upload script / agent. The token is shown once at creation;
// only its sha256 is stored.

export async function GET() {
  const driver = await currentDriver();
  if (!driver) return Response.json({ error: "sign in" }, { status: 401 });
  const tokens = await sql`
    select id, label, created_at, last_used_at from agent_token
    where driver_id = ${driver.id} and revoked_at is null order by created_at desc`;
  return Response.json(tokens);
}

export async function POST(request: Request) {
  const driver = await currentDriver();
  if (!driver) return Response.json({ error: "sign in" }, { status: 401 });
  const { label } = (await request.json().catch(() => ({}))) as { label?: string };
  const token = newToken("acc_");
  const [row] = await sql`
    insert into agent_token (driver_id, token_hash, label)
    values (${driver.id}, ${sha256(token)}, ${(label || "My PC").slice(0, 60)})
    returning id, label, created_at`;
  return Response.json({ ...row, token });
}
