import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ShoppingCartSimple } from "@phosphor-icons/react";

/**
 * Shared header for public sub-pages.
 * Left: "Tillbaka" back-link to / (or backTo prop)
 * Center: clickable logo → /
 * Right: cart icon (→ /registrera-fagel) + uppercase label (e.g. page title)
 */
export default function BackHeader({ label, backTo = "/" }) {
    const { pathname } = useLocation();
    const onCheckout = pathname.startsWith("/registrera-fagel");
    return (
        <header
            className="border-b border-border bg-card sticky top-0 z-30"
            data-testid="back-header"
        >
            <div className="max-w-3xl mx-auto px-6 py-3 grid grid-cols-3 items-center gap-3">
                <Link
                    to={backTo}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground justify-self-start"
                    data-testid="link-back-home"
                >
                    <ArrowLeft size={16} />
                    <span className="hidden sm:inline">Tillbaka</span>
                </Link>
                <Link
                    to="/"
                    className="justify-self-center inline-block group"
                    aria-label="Till startsidan"
                    data-testid="back-header-logo"
                >
                    <img
                        src="/images/fagelregister-logo.png"
                        alt="Fågelregister"
                        className="h-10 w-auto transition-transform group-hover:scale-105"
                    />
                </Link>
                <div className="justify-self-end flex items-center gap-3">
                    {!onCheckout && (
                        <Link
                            to="/registrera-fagel"
                            aria-label="Till kassan – registrera fågel"
                            data-testid="nav-checkout-icon"
                            className="relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-card hover:bg-primary/10 hover:border-primary/40 transition-colors group"
                        >
                            <ShoppingCartSimple
                                size={20}
                                weight="duotone"
                                className="text-foreground group-hover:text-primary transition-colors"
                            />
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
                        </Link>
                    )}
                    <span
                        className="label-caps truncate max-w-[140px]"
                        data-testid="back-header-label"
                    >
                        {label}
                    </span>
                </div>
            </div>
        </header>
    );
}
