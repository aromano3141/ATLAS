"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { MissionData } from "../../../server/mission";

export function useLive(enabled: boolean) {
  const [data, setData] = useState<MissionData>();
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const after = useRef(0);
  const [restart, setRestart] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let stream: EventSource | undefined;
    setData(undefined);
    setConnected(false);
    setWaiting(true);
    setError("");
    after.current = Date.now();
    void (async () => {
      try {
        await api("/mission/atlas-launch/scan", "live", {});
        if (disposed) return;
        stream = new EventSource("/api/mission/atlas-launch/events");
        stream.addEventListener("mission", (event) => {
          if (disposed) return;
          const next: MissionData = JSON.parse((event as MessageEvent).data);
          setData(next);
          setConnected(true);
          setError("");
          if (
            Date.parse(next.progress?.startedAt ?? "") >= after.current ||
            Date.parse(next.snapshot?.retrievedAt ?? "") >= after.current
          )
            setWaiting(false);
        });
        stream.addEventListener("heartbeat", () => {
          if (!disposed) {
            setConnected(true);
            setError("");
          }
        });
        stream.onerror = () => {
          if (!disposed) {
            setConnected(false);
            setError(
              "Live stream disconnected. Reconnecting; retained values are the last received state.",
            );
          }
        };
      } catch (e) {
        if (!disposed) {
          setWaiting(false);
          setError((e as Error).message);
        }
      }
    })();
    return () => {
      disposed = true;
      stream?.close();
    };
  }, [enabled, restart]);
  return {
    data,
    error,
    connected,
    waiting,
    scan: () => setRestart((n) => n + 1),
  };
}
