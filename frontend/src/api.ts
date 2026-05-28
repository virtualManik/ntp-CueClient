import type { NtpTimeRequest, NtpTimeResponse, NtpTimeSuccess } from "./types";

export async function fetchNtpTime(
  request: NtpTimeRequest
): Promise<NtpTimeSuccess> {
  const params = new URLSearchParams({
    host: request.host,
    port: request.port.toString(),
    timeoutMs: request.timeoutMs.toString(),
    version: request.version.toString(),
    socketType: request.socketType,
    amPm: request.amPm.toString()
  });

  const response = await fetch(`/api/ntp-time?${params.toString()}`);
  const body = (await response.json()) as NtpTimeResponse;

  if (!response.ok || !body.ok) {
    throw new Error(body.ok ? response.statusText : body.error);
  }

  return body;
}
