import { NextResponse } from "next/server";
import { getPool } from "@/lib/mssql";

export const runtime = "nodejs";

export async function GET() {
  try {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ok");

    return NextResponse.json({
      ok: true,
      message: "Database connection successful.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Database connection failed.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
