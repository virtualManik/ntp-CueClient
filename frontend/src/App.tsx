import { type FormEvent, useEffect, useMemo, useState } from "react";
import { fetchNtpTime } from "./api";
import type { NtpTimeRequest, NtpTimeSuccess } from "./types";

type SyncStatus = "idle" | "syncing" | "synced" | "error";

interface ClockState {
  status: SyncStatus;
  lastResult?: NtpTimeSuccess;
  error?: string;
  serverEpochMs?: number;
  receivedAtLocalMs?: number;
}

const DEFAULT_REQUEST: NtpTimeRequest = {
  host: "time.google.com",
  port: 123,
  timeoutMs: 3_000,
  version: 4,
  socketType: "udp4",
  amPm: true
};

export default function App() {
  const [host, setHost] = useState(DEFAULT_REQUEST.host);
  const [port, setPort] = useState(DEFAULT_REQUEST.port.toString());
  const [timeoutMs, setTimeoutMs] = useState(
    DEFAULT_REQUEST.timeoutMs.toString()
  );
  const [version, setVersion] = useState<"3" | "4">(
    DEFAULT_REQUEST.version.toString() as "3" | "4"
  );
  const [socketType, setSocketType] = useState<"udp4" | "udp6">(
    DEFAULT_REQUEST.socketType
  );
  const [autoResync, setAutoResync] = useState(false);
  const [amPm, setAmPm] = useState(DEFAULT_REQUEST.amPm);
  const [nowMs, setNowMs] = useState(Date.now());
  const [clock, setClock] = useState<ClockState>({ status: "idle" });

  const validationError = useMemo(
    () => validateForm({ host, port, timeoutMs }),
    [host, port, timeoutMs]
  );

  const displayedDate =
    clock.serverEpochMs !== undefined && clock.receivedAtLocalMs !== undefined
      ? new Date(clock.serverEpochMs + (nowMs - clock.receivedAtLocalMs))
      : undefined;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!autoResync || !clock.lastResult || clock.status === "syncing") {
      return;
    }

    const interval = window.setInterval(() => {
      void syncClock();
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [autoResync, clock.lastResult, clock.status]);

  async function syncClock(): Promise<void> {
    const nextError = validateForm({ host, port, timeoutMs });
    if (nextError) {
      setClock((current) => ({
        ...current,
        status: "error",
        error: nextError
      }));
      return;
    }

    const request: NtpTimeRequest = {
      host: host.trim(),
      port: Number(port),
      timeoutMs: Number(timeoutMs),
      version: Number(version) as 3 | 4,
      socketType,
      amPm
    };

    setClock((current) => ({
      ...current,
      status: "syncing",
      error: undefined
    }));

    try {
      const result = await fetchNtpTime(request);
      setClock({
        status: "synced",
        lastResult: result,
        serverEpochMs: result.epochMs,
        receivedAtLocalMs: Date.now()
      });
      setNowMs(Date.now());
    } catch (error) {
      setClock((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (clock.status !== "syncing") {
      void syncClock();
    }
  }

  return (
    <main className="app-shell">
      <section className="control-band" aria-label="NTP server controls">
        <div className="title-block">
          <h1>Cue NTP Clock</h1>
          <p>UTC time from an NTP server</p>
        </div>

        <form className="control-grid" onSubmit={handleSubmit}>
          <label className="field field-host">
            <span>Host</span>
            <input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="time.google.com"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span>Port</span>
            <input
              value={port}
              onChange={(event) => setPort(event.target.value)}
              inputMode="numeric"
            />
          </label>

          <label className="field">
            <span>Timeout</span>
            <input
              value={timeoutMs}
              onChange={(event) => setTimeoutMs(event.target.value)}
              inputMode="numeric"
            />
          </label>

          <label className="field">
            <span>Version</span>
            <select
              value={version}
              onChange={(event) => setVersion(event.target.value as "3" | "4")}
            >
              <option value="4">NTP 4</option>
              <option value="3">NTP 3</option>
            </select>
          </label>

          <label className="field">
            <span>Socket</span>
            <select
              value={socketType}
              onChange={(event) =>
                setSocketType(event.target.value as "udp4" | "udp6")
              }
            >
              <option value="udp4">UDP4</option>
              <option value="udp6">UDP6</option>
            </select>
          </label>

          <label className="toggle-field">
            <input
              type="checkbox"
              checked={autoResync}
              onChange={(event) => setAutoResync(event.target.checked)}
            />
            <span>Auto-resync</span>
          </label>

          <label className="toggle-field">
            <input
              type="checkbox"
              checked={amPm}
              onChange={(event) => setAmPm(event.target.checked)}
            />
            <span>AM/PM</span>
          </label>

          <button
            type="submit"
            disabled={clock.status === "syncing"}
            className="sync-button"
          >
            {clock.status === "syncing" ? "Syncing" : "Sync"}
          </button>
        </form>

        {(clock.error || validationError) && (
          <div className="error-banner" role="alert">
            {clock.error ?? validationError}
          </div>
        )}
      </section>

      <section className="clock-panel" aria-label="NTP clock display">
        <div className="status-row">
          <span className={`status-dot status-${clock.status}`} />
          <span>{statusLabel(clock.status)}</span>
        </div>

        <time className="digital-clock" dateTime={displayedDate?.toISOString()}>
          {displayedDate ? formatUtcClock(displayedDate) : "--:--:--"}
        </time>

        <div className="ampm-line">
          {amPm
            ? clock.lastResult?.utcAmPm ||
              (displayedDate ? formatUtcAmPm(displayedDate) : "Waiting for sync")
            : "AM/PM disabled"}
        </div>

        <dl className="metadata-grid">
          <div>
            <dt>Server</dt>
            <dd>{clock.lastResult ? `${clock.lastResult.host}:${clock.lastResult.port}` : "-"}</dd>
          </div>
          <div>
            <dt>ISO</dt>
            <dd>{displayedDate?.toISOString() ?? "-"}</dd>
          </div>
          <div>
            <dt>Last sync</dt>
            <dd>
              {clock.receivedAtLocalMs
                ? new Date(clock.receivedAtLocalMs).toLocaleTimeString()
                : "-"}
            </dd>
          </div>
          <div>
            <dt>Source AM/PM</dt>
            <dd>{clock.lastResult?.utcAmPm || "-"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function validateForm(values: {
  host: string;
  port: string;
  timeoutMs: string;
}): string | undefined {
  if (!values.host.trim()) {
    return "Host is required";
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return "Port must be an integer from 1 to 65535";
  }

  const timeoutMs = Number(values.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return "Timeout must be a positive integer";
  }

  return undefined;
}

function formatUtcClock(date: Date): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(
    date.getUTCSeconds()
  )}`;
}

function formatUtcAmPm(date: Date): string {
  const hours24 = date.getUTCHours();
  const hours12 = hours24 % 12 || 12;
  const period = hours24 < 12 ? "AM" : "PM";

  return `${pad2(hours12)}:${pad2(date.getUTCMinutes())}:${pad2(
    date.getUTCSeconds()
  )} ${period} UTC`;
}

function statusLabel(status: SyncStatus): string {
  switch (status) {
    case "idle":
      return "Ready";
    case "syncing":
      return "Syncing";
    case "synced":
      return "Synced";
    case "error":
      return "Needs attention";
  }
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
