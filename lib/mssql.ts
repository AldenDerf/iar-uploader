import sql from "mssql";

function parsePort(value: string | undefined): number {
  if (!value) return 1433;
  const normalized = value.trim().toLowerCase();
  if (normalized === "null" || normalized === "undefined" || normalized === "") {
    return 1433;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 1433;
}

function parseServer(value: string | undefined): {
  server: string;
  instanceName?: string;
} {
  const raw = (value ?? "").trim();
  if (!raw) return { server: "" };

  if (!raw.includes("\\")) {
    return { server: raw };
  }

  const [server, instanceName] = raw.split("\\", 2);
  return {
    server,
    instanceName: instanceName || undefined,
  };
}

const parsedServer = parseServer(process.env.MSSQL_SERVER);

const config: sql.config = {
  server: parsedServer.server,
  database: process.env.MSSQL_DATABASE!,
  user: process.env.MSSQL_USER!,
  password: process.env.MSSQL_PASSWORD!,
  port: parsePort(process.env.MSSQL_PORT),
  options: {
    instanceName: parsedServer.instanceName,
    encrypt: (process.env.MSSQL_ENCRYPT ?? "false") === "true",
    trustServerCertificate:
      (process.env.MSSQL_TRUST_SERVER_CERT ?? "true") === "true",
  },
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect();
  }
  return poolPromise;
}

export { sql };
