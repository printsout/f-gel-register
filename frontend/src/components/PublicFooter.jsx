import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";

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
                {/* Logo linking home */}
                <div className="flex justify-center mb-8">
                    <Link
                        to="/"
                        aria-label="Till startsidan"
                        data-testid="footer-logo"
                        className="inline-block group"
                    >
                        <img
                            src="/images/fagelregister-logo.png"
                            alt="Fågelregister"
                            className="h-24 w-auto transition-transform group-hover:scale-105"
                        />
                    </Link>
                </div>

                {pages.length > 0 && (
                    <div
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3 mb-8 text-center md:text-left"
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
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} Fågelregister
                    </p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                        <a href="mailto:info@fagelregister.se">
                            info@fagelregister.se
                        </a>
                        <span>0768 48 80 91</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
