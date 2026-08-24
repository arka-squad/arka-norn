import { useEffect, useState } from "react";

import type { LiveInvalidation, NornBridge } from "../../../src/application/web/contracts";

export function useLive(bridge: NornBridge, onInvalidate: (event: LiveInvalidation) => void): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let retry: number | undefined;
    const connect = async () => {
      try {
        await bridge.subscribe((event) => {
          setConnected(true);
          onInvalidate(event);
        }, controller.signal);
      } catch {
        setConnected(false);
      }
      if (!controller.signal.aborted) retry = window.setTimeout(() => void connect(), 1500);
    };
    void connect();
    return () => {
      controller.abort();
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [bridge, onInvalidate]);
  return connected;
}
