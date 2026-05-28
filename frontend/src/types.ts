export interface NtpTimeSuccess {
  ok: true;
  host: string;
  port: number;
  timestamp: string;
  epochMs: number;
  utcAmPm: string;
}

export interface NtpTimeError {
  ok: false;
  error: string;
}

export type NtpTimeResponse = NtpTimeSuccess | NtpTimeError;

export interface NtpTimeRequest {
  host: string;
  port: number;
  timeoutMs: number;
  version: 3 | 4;
  socketType: "udp4" | "udp6";
  amPm: boolean;
}
