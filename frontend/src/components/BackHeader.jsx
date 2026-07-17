import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";

/**
 * Shared header for public sub-pages.
 * Left: "Tillbaka" back-link to / (or backTo prop)
 * Center: clickable logo → /
 * Right: uppercase label (e.g. page title)
 */
export default function BackHeader({ label, backTo = "/" }) {
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
                <span
                    className="label-caps justify-self-end truncate max-w-[180px]"
                    data-testid="back-header-label"
                >
                    {label}
                </span>
            </div>
        </header>
    );
}
