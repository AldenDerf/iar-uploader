import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { getPool, sql } from "@/lib/mssql";

export const runtime = "nodejs"; // important for mssql

function cleanAmount(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null; // blanks -> NULL
  const cleaned = s.replace(/₱/g, "").replace(/,/g, "").replace(/\s+/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cleanDate(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Expecting YYYY-MM-DD or something SQL can TRY_CONVERT
  return s;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const csvText = buf.toString("utf-8");

    // Parse CSV with header columns
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, any>[];

    if (records.length === 0) {
      return NextResponse.json({ error: "CSV has no rows" }, { status: 400 });
    }

    const pool = await getPool();

    // Build a bulk insert table (fast + safer)
    const table = new sql.Table("iar_2025_monitoring");
    table.create = false; // table already exists

    table.columns.add("purchase_order_no", sql.NVarChar(50), {
      nullable: true,
    });
    table.columns.add("date_of_delivery", sql.Date, { nullable: true });
    table.columns.add("date_of_preparation_of_iar", sql.Date, {
      nullable: true,
    });
    table.columns.add("prepared_by", sql.NVarChar(150), { nullable: true });
    table.columns.add("iar_no", sql.NVarChar(50), { nullable: true });
    table.columns.add("particulars", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("iar_amount", sql.Decimal(18, 2), { nullable: true });
    table.columns.add("timeline_10wd", sql.NVarChar(50), { nullable: true });
    table.columns.add("supplier_name", sql.NVarChar(200), { nullable: true });
    table.columns.add("delivery_status", sql.NVarChar(50), { nullable: true });

    for (const r of records) {
      table.rows.add(
        r.purchase_order_no ?? null,
        cleanDate(r.date_of_delivery),
        cleanDate(r.date_of_preparation_of_iar),
        r.prepared_by ?? null,
        r.iar_no ?? null,
        r.particulars ?? null,
        cleanAmount(r.iar_amount),
        r.timeline_10wd ?? null,
        r.supplier_name ?? null,
        r.delivery_status ?? null,
      );
    }

    await pool.request().bulk(table);

    return NextResponse.json({
      ok: true,
      inserted: records.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Upload failed" },
      { status: 500 },
    );
  }
}
