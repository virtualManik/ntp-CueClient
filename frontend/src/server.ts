import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getNtpTime, type NtpClientOptions } from "../../src/index";

const DEFAULT_API_PORT = 4174;
const DEFAULT_NTP_PORT = 123;
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_VERSION = 4;
const DEFAULT_SOCKET_TYPE = "udp4";
const DEFAULT_AM_PM = true;

type ApiNtpClientOptions = Required<Omit<NtpClientOptions, "amPm">>;

export function createApiServer() {
  return createServer(async (request, response) => {
    await handleRequest(request, response);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (!request.url) {
    sendJson(response, 400, { ok: false, error: "Missing request URL" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);

  if (request.method === "OPTIONS") {
    writeCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET" || url.pathname !== "/api/ntp-time") {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }

  const parsed = parseNtpRequest(url.searchParams);
  if (!parsed.ok) {
    sendJson(response, 400, { ok: false, error: parsed.error });
    return;
  }

  try {
    const date = await getNtpTime(parsed.host, parsed.port, parsed.options);
    const utcAmPm = parsed.amPm
      ? await getNtpTime(parsed.host, parsed.port, {
          ...parsed.options,
          amPm: true
        })
      : "";

    sendJson(response, 200, {
      ok: true,
      host: parsed.host,
      port: parsed.port,
      timestamp: date.toISOString(),
      epochMs: date.getTime(),
      utcAmPm
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("timed out") ? 504 : 502;
    sendJson(response, status, { ok: false, error: message });
  }
}

type ParsedNtpRequest =
  | {
      ok: true;
      host: string;
      port: number;
      options: ApiNtpClientOptions;
      amPm: boolean;
    }
  | { ok: false; error: string };

export function parseNtpRequest(searchParams: URLSearchParams): ParsedNtpRequest {
  const host = searchParams.get("host")?.trim() ?? "";
  if (!host) {
    return { ok: false, error: "Host is required" };
  }

  const port = parseIntegerParam(searchParams.get("port"), DEFAULT_NTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, error: "Port must be an integer from 1 to 65535" };
  }

  const timeoutMs = parseIntegerParam(
    searchParams.get("timeoutMs"),
    DEFAULT_TIMEOUT_MS
  );
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return { ok: false, error: "Timeout must be a positive integer" };
  }

  const version = parseIntegerParam(searchParams.get("version"), DEFAULT_VERSION);
  if (version !== 3 && version !== 4) {
    return { ok: false, error: "Version must be 3 or 4" };
  }

  const socketType = searchParams.get("socketType") ?? DEFAULT_SOCKET_TYPE;
  if (socketType !== "udp4" && socketType !== "udp6") {
    return { ok: false, error: "Socket type must be udp4 or udp6" };
  }

  const amPm = parseBooleanParam(searchParams.get("amPm"), DEFAULT_AM_PM);
  if (typeof amPm !== "boolean") {
    return { ok: false, error: "AM/PM must be true or false" };
  }

  return {
    ok: true,
    host,
    port,
    amPm,
    options: {
      timeoutMs,
      version,
      socketType
    }
  };
}

function parseIntegerParam(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  return Number(value);
}

function parseBooleanParam(value: string | null, fallback: boolean): boolean | undefined {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  writeCorsHeaders(response);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}

function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? DEFAULT_API_PORT);
  createApiServer().listen(port, "127.0.0.1", () => {
    console.log(`Cue NTP API listening at http://127.0.0.1:${port}`);
  });
}
