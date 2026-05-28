import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders default form values", () => {
    render(<App />);

    expect(screen.getByLabelText("Host")).toHaveValue("time.google.com");
    expect(screen.getByLabelText("Port")).toHaveValue("123");
    expect(screen.getByLabelText("Timeout")).toHaveValue("3000");
    expect(screen.getByLabelText("Version")).toHaveValue("4");
    expect(screen.getByLabelText("Socket")).toHaveValue("udp4");
    expect(screen.getByLabelText("AM/PM")).toBeChecked();
  });

  it("blocks an empty host before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<App />);

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Host is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows server time and metadata after a successful sync", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          host: "127.0.0.1",
          port: 123,
          timestamp: "2026-05-28T15:04:09.000Z",
          epochMs: Date.parse("2026-05-28T15:04:09.000Z"),
          utcAmPm: "03:04:09 PM"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(await screen.findByText("Synced")).toBeInTheDocument();
    expect(screen.getByText(/127\.0\.0\.1:123/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-28T15:04:09/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("amPm=true")
    );
  });

  it("sends AM/PM disabled when the AM/PM control is unchecked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          host: "127.0.0.1",
          port: 123,
          timestamp: "2026-05-28T15:04:09.000Z",
          epochMs: Date.parse("2026-05-28T15:04:09.000Z"),
          utcAmPm: ""
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<App />);
    fireEvent.click(screen.getByLabelText("AM/PM"));
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(await screen.findByText("AM/PM disabled")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("amPm=false")
    );
  });

  it("shows an API error while preserving a previous successful clock", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            host: "127.0.0.1",
            port: 123,
            timestamp: "2026-05-28T15:04:09.000Z",
            epochMs: Date.parse("2026-05-28T15:04:09.000Z"),
            utcAmPm: "03:04:09 PM"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: "Network failed" }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        })
      );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(await screen.findByText("Synced")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network failed");
    expect(screen.getByText(/127\.0\.0\.1:123/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("disables the sync button while a request is pending", async () => {
    let resolveResponse: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(screen.getByRole("button", { name: "Syncing" })).toBeDisabled();

    resolveResponse(
      new Response(
        JSON.stringify({
          ok: true,
          host: "127.0.0.1",
          port: 123,
          timestamp: "2026-05-28T15:04:09.000Z",
          epochMs: Date.parse("2026-05-28T15:04:09.000Z"),
          utcAmPm: "03:04:09 PM"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sync" })).toBeEnabled();
    });
  });
});
