const TOKEN_KEY = "chiken_api_token";

let activeApiToken = "";

function usableBearerToken(token) {
  const value = String(token || "").trim();
  return value && !value.startsWith("sess_") ? value : "";
}

export function setActiveApiToken(token) {
  activeApiToken = usableBearerToken(token);
}

export function getActiveApiToken() {
  return activeApiToken;
}

export function loadStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function persistToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const bearerToken = usableBearerToken(getActiveApiToken());
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);

  const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function ensureTokenSession(token = getActiveApiToken()) {
  const currentToken = usableBearerToken(token);
  if (!currentToken) return true;
  const headers = new Headers({ "Content-Type": "application/json", Authorization: `Bearer ${currentToken}` });
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers,
    body: JSON.stringify({ token: currentToken }),
    credentials: "same-origin"
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  return true;
}

export async function uploadForm(url, formData) {
  const headers = new Headers();
  const bearerToken = usableBearerToken(getActiveApiToken());
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
    credentials: "same-origin"
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function downloadBinary(url, fileName = "download.bin") {
  const headers = new Headers();
  const bearerToken = usableBearerToken(getActiveApiToken());
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  const response = await fetch(url, { headers, credentials: "same-origin" });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function fetchText(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const bearerToken = usableBearerToken(getActiveApiToken());
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.text();
}

export { TOKEN_KEY };
