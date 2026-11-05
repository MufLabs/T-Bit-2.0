import { useEffect } from "react";
import {
  dispatchTBitCognitiveAction,
  tbitCognitiveStore,
  TBitActionMeta,
} from "./store/useTBitCognitiveStore";

type CognitiveEvent = CustomEvent<TBitActionMeta>;

export function TBitCognitiveTelemetry() {
  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CognitiveEvent).detail;
      if (!detail) return;
      tbitCognitiveStore.setLastActionMeta(detail);
    };

    window.addEventListener("tbit:cognitive-action", onAction);
    return () => window.removeEventListener("tbit:cognitive-action", onAction);
  }, []);

  return null;
}

export function emitTBitCanvasAction(meta: Omit<TBitActionMeta, "timestamp"> & { timestamp?: number }) {
  dispatchTBitCognitiveAction(meta);
}
