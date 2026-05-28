import { createSocket, type Socket } from "node:dgram";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApiServer, parseNtpRequest } from "./server";

const NTP_TO_UNIX_EPOCH_SECONDS = 2_208_988_800;
const sockets: Socket[] = [];

afterEach(async () => {
  await Promise.all(sockets.splice(0).map(closeSocket));
});

describe("parseNtpRequest", () => {
  it("rejects missing host", () => {
    expect(parseNtpRequest(new URLSearchParams())).toEqual({
      ok: false,
      error: "Host is required"
    });
  });

  it("rejects invalid port", () => {
    const params = new URLSearchParams({ host: "time.google.com", port: "0" });

    expect(parseNtpRequest(params)).toEqual({
      ok: false,
      error: "Port must be an integer from 1 to 65535"
    });
  });

  it("rejects invalid timeout", () => {
    const params = new URLSearchParams({
      host: "time.google.com",
      timeoutMs: "-1"
    });

    expect(parseNtpRequest(params)).toEqual({
      ok: false,
      error: "Timeout must be a positive integer"
    });
  });

  it("rejects invalid version", () => {
    const params = new URLSearchParams({
      host: "time.google.com",
      version: "2"
    });

    expect(parseNtpRequest(params)).toEqual({
      ok: false,
      error: "Version must be 3 or 4"
    });
  });

  it("rejects invalid socket type", () => {
    const params = new URLSearchParams({
      host: "time.google.com",
      socketType: "tcp"
    });

    expect(parseNtpRequest(params)).toEqual({
      ok: false,
      error: "Socket type must be udp4 or udp6"
    });
  });

  it("rejects invalid AM/PM output values", () => {
    const params = new URLSearchParams({
      host: "time.google.com",
      amPm: "yes"
    });

    expect(parseNtpRequest(params)).toEqual({
      ok: false,
      error: "AM/PM must be true or false"
    });
  });

  it("parses AM/PM output as a boolean option", () => {
    const params = new URLSearchParams({
      host: "time.google.com",
      amPm: "false"
    });

    expect(parseNtpRequest(params)).toEqual({
      ok: true,
      host: "time.google.com",
      port: 123,
      amPm: false,
      options: {
        timeoutMs: 3000,
        version: 4,
        socketType: "udp4"
      }
    });
  });
});

describe("createApiServer", () => {
  it("returns 404 for unknown routes", async () => {
    const api = await startApiServer();
    const response = await fetch(`${api.url}/nope`);

    expect(response.status).toBe(404);
    await api.close();
  });

  it("returns NTP time from a server", async () => {
    const expectedDate = new Date("2026-05-28T15:04:09.250Z");
    const ntp = await startFakeNtpServer({ date: expectedDate });
    const api = await startApiServer();

    const response = await fetch(
      `${api.url}/api/ntp-time?host=127.0.0.1&port=${ntp.port}`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      host: "127.0.0.1",
      port: ntp.port,
      timestamp: expectedDate.toISOString(),
      epochMs: expectedDate.getTime(),
      utcAmPm: "03:04:09 PM"
    });
    await api.close();
  });

  it("can omit AM/PM output when requested", async () => {
    const expectedDate = new Date("2026-05-28T15:04:09.250Z");
    const ntp = await startFakeNtpServer({ date: expectedDate });
    const api = await startApiServer();

    const response = await fetch(
      `${api.url}/api/ntp-time?host=127.0.0.1&port=${ntp.port}&amPm=false`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      host: "127.0.0.1",
      port: ntp.port,
      timestamp: expectedDate.toISOString(),
      epochMs: expectedDate.getTime(),
      utcAmPm: ""
    });
    await api.close();
  });

  it("maps NTP timeouts to 504", async () => {
    const ntp = await startFakeNtpServer({ shouldRespond: false });
    const api = await startApiServer();

    const response = await fetch(
      `${api.url}/api/ntp-time?host=127.0.0.1&port=${ntp.port}&timeoutMs=20`
    );
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("NTP request timed out after 20ms");
    await api.close();
  });
});

interface FakeNtpServerOptions {
  date?: Date;
  shouldRespond?: boolean;
}

async function startFakeNtpServer(
  options: FakeNtpServerOptions
): Promise<{ port: number }> {
  const socket = createSocket("udp4");
  sockets.push(socket);

  socket.on("message", (_message, remote) => {
    if (options.shouldRespond === false) {
      return;
    }

    socket.send(
      createNtpResponse(options.date ?? new Date()),
      remote.port,
      remote.address
    );
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      socket.off("error", reject);
      resolve();
    });
  });

  const address = socket.address();
  if (typeof address === "string") {
    throw new Error(`Unexpected socket address: ${address}`);
  }

  return { port: address.port };
}

function createNtpResponse(date: Date): Buffer {
  const response = Buffer.alloc(48);
  const unixMilliseconds = date.getTime();
  const seconds =
    Math.floor(unixMilliseconds / 1_000) + NTP_TO_UNIX_EPOCH_SECONDS;
  const fraction = Math.round(((unixMilliseconds % 1_000) / 1_000) * 2 ** 32);

  response.writeUInt32BE(seconds, 40);
  response.writeUInt32BE(fraction, 44);

  return response;
}

async function startApiServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function closeSocket(socket: Socket): Promise<void> {
  await new Promise<void>((resolve) => {
    socket.close(() => {
      resolve();
    });
  });
}
