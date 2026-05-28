# Cue NTP

## What It Does

`cue-ntp` is a small TypeScript library for reading time from an NTP server in
Node.js. It sends a UDP NTP client request, parses the server transmit
timestamp, and returns the result as a JavaScript `Date`.

When you want display-friendly UTC time, pass `amPm: true` to return a
`hh:mm:ss AM/PM` string instead.

- Query an NTP server by hostname or IP address.
- Choose the UDP port, timeout, NTP version, socket family, and output format.
- Receive server time as a `Date` by default.
- Return UTC time as `hh:mm:ss AM/PM` with `amPm: true`.
- Use ESM or CommonJS builds from `dist/`.

Because this library uses Node's `node:dgram` UDP sockets, it is intended for
Node.js runtimes. Browser apps should call it through a backend API.

## Installation

This package is currently private, so install it from a local tarball.

Build and package the library:

```sh
npm run pack:local
```

Install the generated tarball in another project:

```sh
npm install /path/to/cue-ntp/cue-ntp-0.1.0.tgz
```

If this package is later published to npm, install it with:

```sh
npm install cue-ntp
```

## Quick Start

```ts
import { getNtpTime } from "cue-ntp";

const date = await getNtpTime("time.google.com", 123);
console.log(date.toISOString());

const time = await getNtpTime("time.google.com", 123, { amPm: true });
console.log(time);
```

`amPm: true` formats the server timestamp as UTC time, not local time.

## Tutorial

### 1. Install Or Pack The Library

From this project, create a local package tarball:

```sh
npm run pack:local
```

Then install that tarball from the project where you want to use the library:

```sh
npm install /path/to/cue-ntp/cue-ntp-0.1.0.tgz
```

### 2. Import The Function

```ts
import { getNtpTime } from "cue-ntp";
```

### 3. Query An NTP Server

Use `getNtpTime` with a host and port. Port `123` is the standard NTP port.

```ts
const date = await getNtpTime("pool.ntp.org", 123);
console.log(date.toISOString());
```

### 4. Return AM/PM Output

Pass `amPm: true` when you want a UTC 12-hour time string instead of a `Date`.

```ts
const time = await getNtpTime("pool.ntp.org", 123, { amPm: true });
console.log(time);
```

### 5. Customize The Request

```ts
import { getNtpTime } from "cue-ntp";

async function main() {
  try {
    const date = await getNtpTime("pool.ntp.org", 123, {
      timeoutMs: 5000,
      version: 4,
      socketType: "udp4"
    });

    const time = await getNtpTime("pool.ntp.org", 123, {
      timeoutMs: 5000,
      version: 4,
      socketType: "udp4",
      amPm: true
    });

    console.log("ISO timestamp:", date.toISOString());
    console.log("UTC AM/PM:", time);
  } catch (error) {
    console.error(
      "Could not read NTP time:",
      error instanceof Error ? error.message : error
    );
  }
}

await main();
```

In this example:

- `pool.ntp.org` is the NTP host.
- `123` is the standard NTP port.
- `timeoutMs` controls how long the request can wait.
- `version` supports `3` or `4`.
- `socketType` supports `"udp4"` or `"udp6"`.
- `amPm` returns a UTC `hh:mm:ss AM/PM` string when set to `true`.

### 6. Catch Request Errors

Network failures, invalid inputs, malformed responses, and timeouts reject the
returned promise. Wrap calls in `try`/`catch` when the request can fail.

## API Reference

### `getNtpTime(ipAddress, port, options?)`

```ts
function getNtpTime(
  ipAddress: string,
  port: number,
  options?: NtpClientOptions
): Promise<Date | string>;
```

Sends an NTP request to the given hostname or IP address and port.

By default, it resolves with the server transmit timestamp as a `Date`.
When `options.amPm` is `true`, it resolves with UTC time formatted as
`hh:mm:ss AM/PM`.

The function validates the port, opens a UDP socket, sends a 48-byte NTP
request, parses the response, and closes the socket when the request settles.

```ts
const date = await getNtpTime("time.google.com", 123);
const time = await getNtpTime("time.google.com", 123, { amPm: true });
```

TypeScript narrows the return type for literal `amPm` options:

```ts
const date = await getNtpTime("time.google.com", 123);
// Date

const time = await getNtpTime("time.google.com", 123, { amPm: true });
// string
```

### `NtpClientOptions`

```ts
interface NtpClientOptions {
  timeoutMs?: number;
  version?: 3 | 4;
  socketType?: "udp4" | "udp6";
  amPm?: boolean;
}
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `timeoutMs` | `3000` | Number of milliseconds before the request rejects. Must be greater than `0`. |
| `version` | `4` | NTP version sent in the request packet. Supports `3` or `4`. |
| `socketType` | `"udp4"` | UDP socket family. Supports `"udp4"` or `"udp6"`. |
| `amPm` | `false` | When `true`, returns UTC time as `hh:mm:ss AM/PM` instead of a `Date`. |

## Error Handling

`getNtpTime` rejects when the request cannot complete. Known error cases
include:

- Invalid port: `Invalid NTP port: <port>`
- Invalid timeout: `Invalid NTP timeout: <timeoutMs>`
- Timeout: `NTP request timed out after <timeoutMs>ms`
- Short response: `Invalid NTP response: expected at least 48 bytes`
- Timestamp before Unix epoch: `Invalid NTP response: transmit timestamp is before Unix epoch`
- Socket or network errors from Node's UDP socket

```ts
try {
  const date = await getNtpTime("time.google.com", 123, { timeoutMs: 1000 });
  console.log(date.toISOString());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
}
```

## Browser And Demo App

The root library cannot run directly in the browser because browsers do not
expose UDP sockets.

The `frontend/` directory contains a Vite/React demo app. It uses a local Node
HTTP API that calls the root `cue-ntp` library, then displays the synced UTC
clock in the browser.

Run the demo:

```sh
cd frontend
npm run dev:all
```

The API defaults to `http://127.0.0.1:4174`. Vite prints the frontend URL in the
terminal.

The demo lets you set the host, port, timeout, NTP version, socket type, AM/PM
output, and auto-resync behavior.

## Development

Install dependencies:

```sh
npm install
```

Useful commands:

```sh
npm run typecheck
npm test
npm run build
npm run validate
```

- `npm run typecheck` runs TypeScript without emitting files.
- `npm test` runs the Vitest suite in `src/**/*.test.ts`.
- `npm run build` builds ESM, CommonJS, declarations, and sourcemaps with
  `tsup`.
- `npm run validate` runs type checking and tests.

## Packaging

Preview package contents:

```sh
npm run pack:dry
```

Create a local package tarball:

```sh
npm run pack:local
```

`pack:local` runs the package `prepack` script first, which validates and builds
the library before creating the `.tgz` file.

## License

MIT
