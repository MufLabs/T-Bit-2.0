import { useTBitCognitiveStore, TBitCognitiveState, tbitCognitiveStore } from "./useTBitCognitiveStore";

export type { TBitActionMeta as TBitAiEventMeta, TBitVector3 } from "./useTBitCognitiveStore";

type StoreApi = ReturnType<typeof useTBitCognitiveStore>;

export function useTBitStore(): StoreApi;
export function useTBitStore<T>(selector: (state: StoreApi) => T): T;
export function useTBitStore<T>(selector?: (state: StoreApi) => T): StoreApi | T {
  const store = useTBitCognitiveStore();
  return selector ? selector(store) : store;
}

export function getTBitStoreSnapshot(): TBitCognitiveState {
  return tbitCognitiveStore.getState();
}
