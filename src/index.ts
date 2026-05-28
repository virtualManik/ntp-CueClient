import { createSocket, type Socket, type SocketType } from "node:dgram";

export interface NtpClientOptions {
  timeoutMs?: number;
  version?: 3 | 4;
  socketType?: Extract<SocketType, "udp4" | "udp6">;
  amPm?: boolean;
}

const NTP_PACKET_LENGTH = 48;
const NTP_TO_UNIX_EPOCH_SECONDS = 2_208_988_800;
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_VERSION = 4;
const DEFAULT_SOCKET_TYPE = "udp4";

export function getNtpTime(
  ipAddress: string,
  port: number,
  options: NtpClientOptions & { amPm: true }
): Promise<string>;
export function getNtpTime(
  ipAddress: string,
  port: number,
  options?: NtpClientOptions & { amPm?: false }
): Promise<Date>;
export function getNtpTime(
  ipAddress: string,
  port: number,
  options?: NtpClientOptions
): Promise<Date | string>;
export async function getNtpTime(
  ipAddress: string,
  port: number,
  options: NtpClientOptions = {}
): Promise<Date | string> {
  validatePort(port);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  validateTimeout(timeoutMs);

  const version = options.version ?? DEFAULT_VERSION;
  const socketType = options.socketType ?? DEFAULT_SOCKET_TYPE;
  const request = createNtpRequest(version);
  const socket = createSocket(socketType);

  const date = await new Promise<Date>((resolve, reject) => {
    let settled = false;

    const finish = (error: Error | undefined, date?: Date): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      closeSocket(socket);

      if (error) {
        reject(error);
        return;
      }

      resolve(date as Date);
    };

    const timer = setTimeout(() => {
      finish(new Error(`NTP request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("error", (error) => {
      finish(error);
    });

    socket.once("message", (message) => {
      try {
        finish(undefined, parseNtpResponse(message));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    socket.send(request, port, ipAddress, (error) => {
      if (error) {
        finish(error);
      }
    });
  });

  return options.amPm === true ? formatUtcAmPmTime(date) : date;
}

function formatUtcAmPmTime(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }

  const hours24 = date.getUTCHours();
  const hours12 = hours24 % 12 || 12;
  const period = hours24 < 12 ? "AM" : "PM";

  return `${pad2(hours12)}:${pad2(date.getUTCMinutes())}:${pad2(
    date.getUTCSeconds()
  )} ${period}`;
}

function createNtpRequest(version: 3 | 4): Buffer {
  const request = Buffer.alloc(NTP_PACKET_LENGTH);
  request[0] = (version << 3) | 3;
  return request;
}

function parseNtpResponse(message: Buffer): Date {
  if (message.length < NTP_PACKET_LENGTH) {
    throw new Error("Invalid NTP response: expected at least 48 bytes");
  }

  const seconds = message.readUInt32BE(40);
  const fraction = message.readUInt32BE(44);
  const unixSeconds = seconds - NTP_TO_UNIX_EPOCH_SECONDS;

  if (unixSeconds < 0) {
    throw new Error("Invalid NTP response: transmit timestamp is before Unix epoch");
  }

  const milliseconds = Math.round((fraction / 2 ** 32) * 1_000);
  return new Date(unixSeconds * 1_000 + milliseconds);
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid NTP port: ${port}`);
  }
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid NTP timeout: ${timeoutMs}`);
  }
}

function closeSocket(socket: Socket): void {
  try {
    socket.close();
  } catch {
    // The socket may already be closed by Node after some error paths.
  }
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
