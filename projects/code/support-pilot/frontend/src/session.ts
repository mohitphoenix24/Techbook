// The sign-in token lives in sessionStorage: it disappears when the tab closes, and no other site can read it.
const KEY = "supportpilot-token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;                       // storage can be blocked: the desk then simply asks you to sign in again
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
