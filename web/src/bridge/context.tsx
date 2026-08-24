import { createContext, useContext } from "react";

import type { NornBridge } from "../../../src/application/web/contracts";

export const BridgeContext = createContext<NornBridge | undefined>(undefined);

export function useBridge(): NornBridge {
  const bridge = useContext(BridgeContext);
  if (bridge === undefined) throw new Error("NornBridge is unavailable.");
  return bridge;
}
