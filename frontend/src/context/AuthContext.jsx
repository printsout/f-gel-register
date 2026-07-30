import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";
import api, { clearAuthTokens } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    // null = still checking, false = anonymous, object = user
    const [user, setUser] = useState(null);
    const [error, setError] = useState(null);

    const refreshUser = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
            return data;
        } catch (err) {
            // Expected for anonymous visitors — log at debug level so real
            // integration failures still show up in dev tools.
            console.debug("[auth] /auth/me failed:", err?.response?.status || err?.message);
            setUser(false);
            return null;
        }
    }, []);

    useEffect(() => {
        // CRITICAL: If returning from OAuth callback, skip the /me check.
        // AuthCallback will exchange the session_id and establish the session first.
        if (window.location.hash?.includes("session_id=")) {
            return;
        }
        refreshUser();
    }, [refreshUser]);

    const login = async (email, password, totp_code) => {
        setError(null);
        const payload = { email, password };
        if (totp_code) payload.totp_code = totp_code;
        const { data } = await api.post("/auth/login", payload);
        setUser(data);
        return data;
    };

    const register = async (payload) => {
        setError(null);
        const { data } = await api.post("/auth/register", payload);
        setUser(data);
        return data;
    };

    const logout = async () => {
        try {
            await api.post("/auth/logout");
        } catch (err) {
            console.debug("[auth] /auth/logout failed (clearing local state anyway):", err?.message);
        }
        clearAuthTokens();
        setUser(false);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                setUser,
                error,
                setError,
                login,
                register,
                logout,
                refreshUser,
                isAdmin: user && user.role === "admin",
                isAuthenticated: !!user,
                isLoading: user === null,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
