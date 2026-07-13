import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function Loader() {
    return (
        <div
            className="min-h-screen flex items-center justify-center bg-background"
            data-testid="loader-root"
        >
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Laddar…</p>
            </div>
        </div>
    );
}

export function ProtectedRoute({ children, requireAdmin = false }) {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) return <Loader />;
    if (!user)
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
            />
        );
    if (requireAdmin && user.role !== "admin")
        return <Navigate to="/" replace />;
    return children;
}

export { Loader };
