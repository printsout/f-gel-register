import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
    ChartLineUp,
    UsersThree,
    Bird,
    MapPin,
    TicketIcon,
    ChatCircleDots,
    Star,
    ListChecks,
    SignOut,
    List as ListIcon,
    X,
    Feather,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
    { to: "/admin", label: "Översikt", icon: ChartLineUp, end: true },
    { to: "/admin/registered-birds", label: "Registrerade fåglar", icon: Bird },
    { to: "/admin/found-birds", label: "Hittade fåglar", icon: MapPin },
    { to: "/admin/users", label: "Användare", icon: UsersThree },
    { to: "/admin/discount-codes", label: "Rabattkoder", icon: TicketIcon },
    { to: "/admin/comments", label: "Kommentarer", icon: ChatCircleDots },
    { to: "/admin/feedback", label: "Feedback", icon: Star },
    { to: "/admin/activity", label: "Aktivitetslogg", icon: ListChecks },
];

export default function AdminLayout({ children }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = async () => {
        await logout();
        navigate("/login", { replace: true });
    };

    const initials = ((user?.first_name?.[0] || user?.email?.[0]) + (user?.last_name?.[0] || "")).toUpperCase();

    return (
        <div className="min-h-screen flex bg-background">
            {/* Sidebar */}
            <aside
                className={`fixed lg:sticky top-0 h-screen w-[260px] flex-shrink-0 z-40 flex flex-col transition-transform duration-200 ${
                    mobileOpen
                        ? "translate-x-0"
                        : "-translate-x-full lg:translate-x-0"
                }`}
                style={{ background: "hsl(var(--sidebar-bg))" }}
                data-testid="admin-sidebar"
            >
                <div className="px-6 py-6 flex items-center gap-3 border-b border-white/5">
                    <div
                        className="w-10 h-10 rounded-md flex items-center justify-center"
                        style={{ background: "hsl(var(--primary))" }}
                    >
                        <Feather size={22} weight="duotone" color="#fff" />
                    </div>
                    <div>
                        <p
                            className="font-display font-bold text-white text-lg leading-none"
                            style={{ letterSpacing: "-0.02em" }}
                        >
                            Papegoj­registret
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-sidebar-muted mt-1">
                            Admin
                        </p>
                    </div>
                    <button
                        className="ml-auto lg:hidden text-white"
                        onClick={() => setMobileOpen(false)}
                        data-testid="button-close-sidebar"
                    >
                        <X size={22} />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
                    {NAV.map(({ to, label, icon: Icon, end }) => {
                        const active = end
                            ? location.pathname === to
                            : location.pathname.startsWith(to);
                        return (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                data-active={active}
                                data-testid={`nav-${to.replace(/\//g, "-")}`}
                                onClick={() => setMobileOpen(false)}
                                className="sidebar-item"
                            >
                                <Icon size={20} weight={active ? "fill" : "duotone"} />
                                <span>{label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="border-t border-white/5 p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold"
                            style={{
                                background: "hsl(var(--primary))",
                                color: "white",
                            }}
                        >
                            {initials || "A"}
                        </div>
                        <div className="min-w-0">
                            <p
                                className="text-sm text-white font-medium truncate"
                                data-testid="text-current-user-name"
                            >
                                {user?.first_name
                                    ? `${user.first_name} ${user.last_name || ""}`.trim()
                                    : user?.email}
                            </p>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-sidebar-muted">
                                {user?.role}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                        onClick={handleLogout}
                        data-testid="button-logout"
                    >
                        <SignOut size={16} className="mr-2" />
                        Logga ut
                    </Button>
                </div>
            </aside>

            {/* Backdrop for mobile */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-30 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Main */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Mobile top bar */}
                <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
                    <button
                        onClick={() => setMobileOpen(true)}
                        className="p-2 rounded-md hover:bg-muted"
                        data-testid="button-open-sidebar"
                    >
                        <ListIcon size={22} />
                    </button>
                    <p className="font-display font-bold">Papegojregistret</p>
                </div>

                <main className="flex-1 overflow-x-hidden">
                    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-8 slide-up">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
