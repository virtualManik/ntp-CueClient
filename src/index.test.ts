import { createSocket, type Socket } from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";

import { getNtpTime } from "./index";

const NTP_TO_UNIX_EPOCH_SECONDS = 2_208_988_800;

const servers: Socket[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("getNtpTime", () => {
  it("reads the transmit timestamp from an NTP server response", async () => {
    const expectedDate = new Date("2026-05-28T15:04:09.250Z");
    const { port, receivedPackets } = await startFakeNtpServer({
      date: expectedDate
    });

    const date = await getNtpTime("127.0.0.1", port);

    expect(date.toISOString()).toBe(expectedDate.toISOString());
    expect(receivedPackets).toHaveLength(1);
    expect(receivedPackets[0]).toHaveLength(48);
    expect(receivedPackets[0]?.[0]).toBe(0x23);
  });

  it("supports NTP version 3 requests", async () => {
    const { port, receivedPackets } = await startFakeNtpServer({
      date: new Date("2026-05-28T10:00:00.000Z")
    });

    await getNtpTime("127.0.0.1", port, { version: 3 });

    expect(receivedPackets[0]?.[0]).toBe(0x1b);
  });

  it("returns a Date when AM/PM output is disabled explicitly", async () => {
    const expectedDate = new Date("2026-05-28T12:30:45.000Z");
    const { port } = await startFakeNtpServer({
      date: expectedDate
    });

    const date = await getNtpTime("127.0.0.1", port, { amPm: false });

    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe(expectedDate.toISOString());
  });

  it("formats the server time as UTC AM/PM", async () => {
    const { port } = await startFakeNtpServer({
      date: new Date("2026-05-28T15:04:09.000Z")
    });

    await expect(getNtpTime("127.0.0.1", port, { amPm: true })).resolves.toBe(
      "03:04:09 PM"
    );
  });

  it("rejects malformed short responses", async () => {
    const { port } = await startFakeNtpServer({
      response: Buffer.alloc(10)
    });

    await expect(getNtpTime("127.0.0.1", port)).rejects.toThrow(
      "Invalid NTP response: expected at least 48 bytes"
    );
  });

  it("rejects requests that time out", async () => {
    const { port } = await startFakeNtpServer({
      shouldRespond: false
    });

    await expect(
      getNtpTime("127.0.0.1", port, { timeoutMs: 20 })
    ).rejects.toThrow("NTP request timed out after 20ms");
  });

  it("rejects invalid ports before sending", async () => {
    await expect(getNtpTime("127.0.0.1", 0)).rejects.toThrow(
      "Invalid NTP port: 0"
    );
  });
});

interface FakeNtpServerOptions {
  date?: Date;
  response?: Buffer;
  shouldRespond?: boolean;
}

async function startFakeNtpServer(
  options: FakeNtpServerOptions
): Promise<{ port: number; receivedPackets: Buffer[] }> {
  const server = createSocket("udp4");
  const receivedPackets: Buffer[] = [];
  servers.push(server);

  server.on("message", (message, remote) => {
    receivedPackets.push(Buffer.from(message));

    if (options.shouldRespond === false) {
      return;
    }

    const response = options.response ?? createNtpResponse(options.date ?? new Date());
    server.send(response, remote.port, remote.address);
  });

  await bindServer(server);

  return {
    port: getServerPort(server),
    receivedPackets
  };
}

function createNtpResponse(date: Date): Buffer {
  const response = Buffer.alloc(48);
  const unixMilliseconds = date.getTime();
  const seconds = Math.floor(unixMilliseconds / 1_000) + NTP_TO_UNIX_EPOCH_SECONDS;
  const fraction = Math.round(((unixMilliseconds % 1_000) / 1_000) * 2 ** 32);

  response.writeUInt32BE(seconds, 40);
  response.writeUInt32BE(fraction, 44);

  return response;
}

async function bindServer(server: Socket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server: Socket): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

function getServerPort(server: Socket): number {
  const address = server.address();

  if (typeof address === "string") {
    throw new Error(`Unexpected pipe address: ${address}`);
  }

  return address.port;
}
