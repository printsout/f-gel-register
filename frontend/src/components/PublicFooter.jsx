import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EnvelopeSimple } from "@phosphor-icons/react";
import api from "@/lib/api";
import { openCookieSettings } from "@/components/CookieConsent";

export default function PublicFooter() {
    const [pages, setPages] = useState([]);
    useEffect(() => {
        api.get("/content")
            .then(({ data }) => setPages(data))
            .catch(() => {});
    }, []);

    return (
        <footer
            className="border-t border-border py-12 bg-card mt-16"
            data-testid="public-footer"
        >
            <div className="max-w-6xl mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-8">
                    {/* Left column: Logo + big contact button */}
                    <div className="flex flex-col items-start gap-6 md:col-span-1">
                        <Link
                            to="/"
                            aria-label="Till startsidan"
                            data-testid="footer-logo"
                            className="inline-block group"
                        >
                            <img
                                src="/images/fagelregister-logo.png"
                                alt="Fågelregister"
                                className="h-28 w-auto transition-transform group-hover:scale-105"
                            />
                        </Link>
                        <Link
                            to="/kontakt"
                            data-testid="footer-contact-button"
                            className="inline-flex items-center gap-3 px-8 py-5 text-lg font-semibold rounded-xl bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:opacity-90 transition-all"
                        >
                            <EnvelopeSimple size={24} weight="duotone" />
                            Kontakta oss
                        </Link>
                    </div>

                    {/* Right column: page links */}
                    {pages.length > 0 && (
                        <div
                            className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3"
                            data-testid="footer-links-grid"
                        >
                            {pages.map((p) => (
                                <Link
                                    key={p.id}
                                    to={`/sidor/${p.slug}`}
                                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                    data-testid={`footer-link-${p.slug}`}
                                >
                                    {p.title}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} Fågelregister
                    </p>
                    <div className="flex gap-4 text-xs text-muted-foreground items-center">
                        <a href="mailto:info@fagelregister.se">
                            info@fagelregister.se
                        </a>
                        <span>0768 48 80 91</span>
                        <button
                            type="button"
                            onClick={openCookieSettings}
                            className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
                            data-testid="footer-cookie-settings"
                        >
                            Cookie-inställningar
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    );
}
