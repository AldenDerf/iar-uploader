"use client";

import { useEffect, useMemo, useState } from "react";

type DbStatus = "checking" | "connected" | "failed";
type PreviewRow = Record<string, string>;

function parseCsv(text: string): { headers: string[]; rows: PreviewRow[] } {
  const src = text.replace(/^\uFEFF/, "");
  const grid: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) grid.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some((v) => v.trim() !== "")) grid.push(row);
  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = grid[0].map((h) => h.trim());
  const rows = grid.slice(1).map((values) => {
    const item: PreviewRow = {};
    headers.forEach((header, idx) => {
      item[header || `column_${idx + 1}`] = values[idx] ?? "";
    });
    return item;
  });

  return { headers, rows };
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [dbStatus, setDbStatus] = useState<DbStatus>("checking");
  const [dbMessage, setDbMessage] = useState("Checking database connection...");
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [isParsingPreview, setIsParsingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string>("");

  async function checkDbConnection() {
    setDbStatus("checking");
    setDbMessage("Checking database connection...");

    try {
      const res = await fetch("/api/db-status", { method: "GET" });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setDbStatus("failed");
        setDbMessage(data.error ?? "Database connection failed.");
        return;
      }

      setDbStatus("connected");
      setDbMessage("Database connected. Upload is enabled.");
    } catch {
      setDbStatus("failed");
      setDbMessage("Could not check database connection.");
    }
  }

  useEffect(() => {
    void checkDbConnection();
  }, []);

  async function loadPreview(selected: File | null) {
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewError("");

    if (!selected) return;

    setIsParsingPreview(true);
    try {
      const text = await selected.text();
      const parsed = parseCsv(text);

      if (parsed.headers.length === 0) {
        setPreviewError("CSV appears empty.");
        return;
      }

      if (parsed.rows.length === 0) {
        setPreviewError("CSV has headers but no data rows.");
        return;
      }

      setPreviewHeaders(parsed.headers);
      setPreviewRows(parsed.rows);
    } catch {
      setPreviewError("Unable to parse CSV file.");
    } finally {
      setIsParsingPreview(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (dbStatus !== "connected") {
      setIsSuccess(false);
      setMsg("Database is not connected. Please fix connection and retry.");
      return;
    }

    if (!file) {
      setIsSuccess(false);
      setMsg("Please choose a CSV file.");
      return;
    }
    if (previewError || previewRows.length === 0) {
      setIsSuccess(false);
      setMsg("Please review and fix CSV preview issues before uploading.");
      return;
    }

    setIsUploading(true);
    setIsSuccess(null);
    setMsg("Uploading file. Please wait...");

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/upload-iar", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setIsSuccess(false);
        setMsg(`Upload failed: ${data.error ?? "Unknown error"}`);
      } else {
        setIsSuccess(true);
        setMsg(`Upload complete. Inserted ${data.inserted} rows.`);
      }
    } catch {
      setIsSuccess(false);
      setMsg("Network error while uploading. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  const fileMeta = useMemo(() => {
    if (!file) return null;
    const kb = Math.max(1, Math.round(file.size / 1024));
    return `${file.name} (${kb} KB)`;
  }, [file]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            IAR Monitoring CSV Uploader
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Upload one CSV file and insert the records to MSSQL in a single
            batch.
          </p>

          <div
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              dbStatus === "connected"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : dbStatus === "failed"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <p>{dbMessage}</p>
            <button
              type="button"
              onClick={() => void checkDbConnection()}
              disabled={dbStatus === "checking"}
              className="mt-2 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dbStatus === "checking" ? "Checking..." : "Retry connection"}
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label
              htmlFor="file"
              className="block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"
            >
              <span className="block text-sm font-medium text-slate-800">
                CSV file
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Accepted format: .csv
              </span>

              <input
                id="file"
                type="file"
                name="file"
                accept=".csv"
                className="mt-3 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  setFile(selected);
                  setMsg("");
                  setIsSuccess(null);
                  void loadPreview(selected);
                }}
              />
            </label>

            {fileMeta ? (
              <p className="text-sm text-slate-700">Selected: {fileMeta}</p>
            ) : (
              <p className="text-sm text-slate-500">No file selected yet.</p>
            )}

            <button
              type="submit"
              disabled={
                isUploading ||
                !file ||
                dbStatus !== "connected" ||
                isParsingPreview ||
                !!previewError ||
                previewRows.length === 0
              }
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isUploading ? "Uploading..." : "Upload CSV"}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-800">
              CSV Preview Before Upload
            </h2>
            {isParsingPreview ? (
              <p className="mt-2 text-sm text-slate-600">Parsing CSV...</p>
            ) : null}
            {!isParsingPreview && previewError ? (
              <p className="mt-2 text-sm text-rose-700">{previewError}</p>
            ) : null}
            {!isParsingPreview && !previewError && previewRows.length > 0 ? (
              <>
                <p className="mt-2 text-sm text-slate-700">
                  Showing all {previewRows.length} row(s).
                </p>
                <div className="mt-3 max-h-[28rem] overflow-x-auto overflow-y-auto rounded-md border border-slate-200 bg-white">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        {previewHeaders.map((header) => (
                          <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          {previewHeaders.map((header) => (
                            <td key={`${idx}-${header}`} className="whitespace-nowrap px-3 py-2 text-slate-700">
                              {row[header]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            {!isParsingPreview && !previewError && previewRows.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Select a CSV file to preview data before upload.
              </p>
            ) : null}
          </div>

          {msg ? (
            <p
              className={`mt-5 rounded-md border px-3 py-2 text-sm ${
                isSuccess === true
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isSuccess === false
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {msg}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
