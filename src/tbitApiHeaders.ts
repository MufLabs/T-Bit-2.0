type TBitUserProfileStorage = {
  userId?: string;
  displayName?: string;
  vaultRoot?: string;
};

export function getLocalApiKey(): string {
  return (
    import.meta.env.VITE_TBIT_API_KEY ??
    localStorage.getItem("tbit_api_key") ??
    localStorage.getItem("tbitApiKey") ??
    ""
  );
}

export function getActiveUserProfile(): TBitUserProfileStorage | null {
  try {
    const profile = JSON.parse(localStorage.getItem("tbit_user_profile") ?? "null") as TBitUserProfileStorage | null;
    return profile && typeof profile === "object" ? profile : null;
  } catch {
    return null;
  }
}

export function getActiveUserId(): string {
  const profile = getActiveUserProfile();
  return profile?.userId?.trim() || profile?.displayName?.trim() || "";
}

export function getActiveVaultRoot(): string {
  return getActiveUserProfile()?.vaultRoot?.trim() || "";
}

export function buildTBitApiHeaders(includeJson = false, overrides?: { userId?: string; vaultRoot?: string }): HeadersInit {
  const headers: Record<string, string> = { "x-tbit-api-key": getLocalApiKey() };
  const userId = overrides?.userId?.trim() || getActiveUserId();
  const vaultRoot = overrides?.vaultRoot?.trim() || getActiveVaultRoot();

  if (userId) headers["x-tbit-user-id"] = userId;
  if (vaultRoot) headers["x-tbit-vault-root"] = vaultRoot;
  if (includeJson) headers["Content-Type"] = "application/json; charset=utf-8";
  return headers;
}
