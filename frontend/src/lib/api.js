import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const ACCESS_KEY = "auth_access_token";
const REFRESH_KEY = "auth_refresh_token";

export function getAccessToken() {
    try { return localStorage.getItem(ACCESS_KEY); } catch (_) { return null; }
}
export function getRefreshToken() {
    try { return localStorage.getItem(REFRESH_KEY); } catch (_) { return null; }
}
export function setAuthTokens(access, refresh) {
    try {
        if (access) localStorage.setItem(ACCESS_KEY, access);
        if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    } catch (_) { /* ignore */ }
}
export function clearAuthTokens() {
    try {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
    } catch (_) { /* ignore */ }
}

const api = axios.create({
    baseURL: API,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

// Attach Authorization header from localStorage (Bearer) — needed on cross-site
// deploys where third-party cookies get blocked by the browser.
api.interceptors.request.use((config) => {
    const t = getAccessToken();
    if (t) {
        config.headers = config.headers || {};
        if (!config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${t}`;
        }
    }
    return config;
});

// Store tokens returned from login/register/refresh so subsequent requests
// can send them as Authorization headers.
api.interceptors.response.use(
    (response) => {
        const d = response?.data;
        if (d && typeof d === "object") {
            if (d.access_token || d.refresh_token) {
                setAuthTokens(d.access_token, d.refresh_token);
            }
        }
        return response;
    },
    async (error) => {
        // Try silent refresh on 401 once
        const original = error?.config;
        if (
            error?.response?.status === 401 &&
            original &&
            !original.__retriedAuth &&
            !original.url?.includes("/auth/")
        ) {
            original.__retriedAuth = true;
            const refresh = getRefreshToken();
            if (refresh) {
                try {
                    const { data } = await axios.post(
                        `${API}/auth/refresh`,
                        { refresh_token: refresh },
                        { withCredentials: true },
                    );
                    if (data?.access_token) {
                        setAuthTokens(data.access_token, null);
                        original.headers = original.headers || {};
                        original.headers.Authorization = `Bearer ${data.access_token}`;
                        return api(original);
                    }
                } catch (_) { /* fall-through */ }
            }
        }
        return Promise.reject(error);
    },
);

// Small helper – FastAPI validation errors return arrays of {msg,...}. Convert to string.
export function formatApiError(err) {
    const detail = err?.response?.data?.detail;
    if (detail == null) return err?.message || "Något gick fel.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail
            .map((e) =>
                e && typeof e.msg === "string" ? e.msg : JSON.stringify(e),
            )
            .filter(Boolean)
            .join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
}

export default api;
