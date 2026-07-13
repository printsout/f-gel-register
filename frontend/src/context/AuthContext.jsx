import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";
import api from "@/lib/api";

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
        } catch (e) {
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

    const login = async (email, password) => {
        setError(null);
        const { data } = await api.post("/auth/login", { email, password });
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
        } catch (_) {}
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
