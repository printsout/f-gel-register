import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AuthCallback() {
    const navigate = useNavigate();
    const { setUser } = useAuth();
    const hasProcessed = useRef(false);

    useEffect(() => {
        if (hasProcessed.current) return;
        hasProcessed.current = true;

        const hash = window.location.hash;
        const match = hash.match(/session_id=([^&]+)/);
        const sessionId = match ? decodeURIComponent(match[1]) : null;

        if (!sessionId) {
            navigate("/login", { replace: true });
            return;
        }

        (async () => {
            try {
                const { data } = await api.post("/auth/google/session", {
                    session_id: sessionId,
                });
                setUser(data);
                // Clean fragment then redirect
                window.history.replaceState(
                    null,
                    "",
                    window.location.pathname,
                );
                toast.success("Inloggad med Google!");
                navigate(data.role === "admin" ? "/admin" : "/", {
                    replace: true,
                });
            } catch (err) {
                toast.error(formatApiError(err));
                navigate("/login", { replace: true });
            }
        })();
    }, [navigate, setUser]);

    return (
        <div
            className="min-h-screen flex items-center justify-center bg-background"
            data-testid="auth-callback"
        >
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">
                    Loggar in dig…
                </p>
            </div>
        </div>
    );
}
