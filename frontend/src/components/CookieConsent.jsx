import { useEffect, useState } from "react";
import { X, Cookie, ShieldCheck, ChartLineUp } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const STORAGE_KEY = "cookie_consent_v1";

export function getConsent() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function saveConsent(value) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...value, ts: new Date().toISOString() }),
        );
    } catch (_) {
        /* ignore quota errors */
    }
    window.dispatchEvent(new CustomEvent("cookie-consent-change", { detail: value }));
}

export function openCookieSettings() {
    window.dispatchEvent(new CustomEvent("open-cookie-settings"));
}

export default function CookieConsent() {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState("banner"); // "banner" | "custom"
    const [analytics, setAnalytics] = useState(false);
    const [marketing, setMarketing] = useState(false);

    useEffect(() => {
        if (!getConsent()) {
            // Slight delay so the banner doesn't blink on route change
            const t = setTimeout(() => setOpen(true), 250);
            return () => clearTimeout(t);
        }
    }, []);

    useEffect(() => {
        const openHandler = () => {
            const existing = getConsent();
            if (existing) {
                setAnalytics(!!existing.analytics);
                setMarketing(!!existing.marketing);
            }
            setMode("custom");
            setOpen(true);
        };
        window.addEventListener("open-cookie-settings", openHandler);
        return () => window.removeEventListener("open-cookie-settings", openHandler);
    }, []);

    const acceptAll = () => {
        saveConsent({ necessary: true, analytics: true, marketing: true });
        setOpen(false);
    };
    const acceptNecessary = () => {
        saveConsent({ necessary: true, analytics: false, marketing: false });
        setOpen(false);
    };
    const savePrefs = () => {
        saveConsent({ necessary: true, analytics, marketing });
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4 pointer-events-none"
            data-testid="cookie-consent-banner"
        >
            <div className="pointer-events-auto max-w-3xl mx-auto rounded-2xl border border-border bg-card shadow-2xl backdrop-blur-md">
                {mode === "banner" ? (
                    <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-4 sm:items-center">
                        <div className="flex-shrink-0 hidden sm:flex h-11 w-11 rounded-xl bg-primary/10 items-center justify-center">
                            <Cookie size={24} weight="duotone" className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-display font-bold text-base leading-tight">
                                Vi använder cookies
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Nödvändiga cookies används för inloggning och betalning. Med ditt
                                samtycke använder vi också cookies för analys och marknadsföring
                                så vi kan förbättra tjänsten. Du kan ändra ditt val när som helst.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:flex-col md:flex-row sm:min-w-[220px]">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMode("custom")}
                                className="flex-1"
                                data-testid="cookie-btn-customize"
                            >
                                Anpassa
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={acceptNecessary}
                                className="flex-1"
                                data-testid="cookie-btn-necessary"
                            >
                                Endast nödvändiga
                            </Button>
                            <Button
                                size="sm"
                                onClick={acceptAll}
                                className="flex-1"
                                data-testid="cookie-btn-accept-all"
                            >
                                Acceptera alla
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="p-5 sm:p-6 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-display font-bold text-base leading-tight">
                                    Cookie-inställningar
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Välj vilka kategorier av cookies du tillåter.
                                </p>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1 rounded-md hover:bg-muted transition"
                                aria-label="Stäng"
                                data-testid="cookie-btn-close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                                <ShieldCheck size={22} weight="duotone" className="text-[hsl(var(--success))] mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-sm">Nödvändiga</span>
                                        <span className="text-xs text-muted-foreground">Alltid på</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Krävs för inloggning, säkerhet och betalning via Stripe.
                                    </p>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                                <ChartLineUp size={22} weight="duotone" className="text-primary mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-sm">Analys</span>
                                        <Switch
                                            checked={analytics}
                                            onCheckedChange={setAnalytics}
                                            data-testid="cookie-switch-analytics"
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Hjälper oss förstå hur besökare använder sajten så vi kan förbättra flöden.
                                    </p>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                                <Cookie size={22} weight="duotone" className="text-primary mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-sm">Marknadsföring</span>
                                        <Switch
                                            checked={marketing}
                                            onCheckedChange={setMarketing}
                                            data-testid="cookie-switch-marketing"
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Används för att visa relevanta kampanjer och mäta effekten av annonser.
                                    </p>
                                </div>
                            </label>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={acceptNecessary}
                                data-testid="cookie-btn-necessary-2"
                            >
                                Endast nödvändiga
                            </Button>
                            <Button
                                size="sm"
                                onClick={savePrefs}
                                data-testid="cookie-btn-save"
                            >
                                Spara val
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
