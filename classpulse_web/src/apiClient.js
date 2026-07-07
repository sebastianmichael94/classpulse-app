import axios from 'axios';

export const AUTH_SESSION_KEY = 'classpulse.authSession';
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const LEGACY_INVALID_TOKENS = new Set(['admin-override-token-12345']);

export function readAuthSession() {
  try {
    const rawValue = localStorage.getItem(AUTH_SESSION_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed?.token) {
      return null;
    }

    const storedToken = String(parsed.token || '').trim();
    if (!storedToken || LEGACY_INVALID_TOKENS.has(storedToken)) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      delete axios.defaults.headers.common.Authorization;
      return null;
    }

    const expiresAt = parsed?.expiresAt ? new Date(parsed.expiresAt).getTime() : null;
    if (expiresAt && Date.now() > expiresAt) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      delete axios.defaults.headers.common.Authorization;
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function persistAuthSession(sessionPayload) {
  const token = String(sessionPayload?.token || '').trim();
  if (!token) {
    return;
  }

  const payload = {
    ...sessionPayload,
    savedAt: sessionPayload?.savedAt || new Date().toISOString(),
    expiresAt: sessionPayload?.expiresAt || new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };

  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(payload));
  initializeHttpAuthFromStorage();
}

export function readAccessToken() {
  return readAuthSession()?.token || null;
}

function getAuthorizationValue() {
  const token = readAccessToken();
  if (!token) {
    return null;
  }
  return `Bearer ${token}`;
}

export function initializeHttpAuthFromStorage() {
  const authorizationValue = getAuthorizationValue();

  if (authorizationValue) {
    axios.defaults.headers.common.Authorization = authorizationValue;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
}

export function buildAuthHeaders(baseHeaders = {}) {
  const headers = { ...(baseHeaders || {}) };
  if (!headers.Authorization) {
    const authorizationValue = getAuthorizationValue();
    if (authorizationValue) {
      headers.Authorization = authorizationValue;
    }
  }
  return headers;
}

let axiosInterceptorConfigured = false;

export function setupAxiosAuthInterceptor() {
  if (axiosInterceptorConfigured) {
    return;
  }

  axios.interceptors.request.use((config) => {
    const nextConfig = { ...config };
    nextConfig.headers = buildAuthHeaders(nextConfig.headers || {});
    return nextConfig;
  });

  axiosInterceptorConfigured = true;
}

export async function authFetch(url, options = {}) {
  const nextOptions = { ...options };
  nextOptions.headers = buildAuthHeaders(options?.headers || {});
  return fetch(url, nextOptions);
}
