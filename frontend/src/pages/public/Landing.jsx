import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Feather,
    Shield,
    MagnifyingGlass,
    ArrowRight,
    MapPin,
    SignIn,
    WarningCircle,
    Heart,
    Star,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import PublicFooter from "@/components/PublicFooter";
import api from "@/lib/api";

const ICON_MAP = {
    feather: Feather,
    shield: Shield,
    "magnifying-glass": MagnifyingGlass,
    "map-pin": MapPin,
    heart: Heart,
    star: Star,
};

function highlightTitle(title, word) {
    if (!title) return null;
    if (!word) return <>{title}</>;
    const parts = title.split(new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"));
    return parts.map((p, i) =>
        p.toLowerCase() === word.toLowerCase() ? (
            <span key={i} className="text-primary">{p}</span>
        ) : (
            <span key={i}>{p}</span>
        ),
    );
}

function HeroSection({ config, user, isAdmin }) {
    return (
        <section className="max-w-6xl mx-auto px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
            <div>
                {config.eyebrow && <p className="label-caps mb-4">{config.eyebrow}</p>}
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-[1.05]">
                    {highlightTitle(config.title, config.highlighted_word)}
                </h1>
                {config.body && (
                    <p className="text-lg text-muted-foreground mt-6 max-w-lg">{config.body}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-8">
                    {config.cta_primary_label && (
                        <Link to={config.cta_primary_link || "/"}>
                            <Button size="lg" className="h-12 px-6" data-testid="button-hero-cta1">
                                {config.cta_primary_label}
                                <ArrowRight size={18} className="ml-2" />
                            </Button>
                        </Link>
                    )}
                    {config.cta_secondary_label && (
                        <Link to={config.cta_secondary_link || "/"}>
                            <Button size="lg" variant="outline" className="h-12 px-6" data-testid="button-hero-cta2">
                                {config.cta_secondary_label}
                            </Button>
                        </Link>
                    )}
                    {config.cta_tertiary_label && (
                        <Link to={config.cta_tertiary_link || "/"}>
                            <Button size="lg" variant="ghost" className="h-12 px-6" data-testid="button-hero-cta3">
                                <MapPin size={18} className="mr-2" />
                                {config.cta_tertiary_label}
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
            {config.image_url && (
                <div
                    className="relative aspect-[4/5] rounded-lg overflow-hidden hidden lg:block"
                    style={{ backgroundImage: `url('${config.image_url}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                >
                    <div className="absolute bottom-6 left-6 right-6 p-5 rounded-md bg-card/90 backdrop-blur border border-border">
                        <p className="label-caps mb-1">{config.eyebrow || "Papegojregistret"}</p>
                        <p className="font-display text-2xl font-bold">Skydd genom gemenskap</p>
                    </div>
                </div>
            )}
        </section>
    );
}

function EmergencyCta({ config }) {
    const tone = config.tone || "destructive";
    const cls =
        tone === "primary"
            ? "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 [&_.tone-icon]:text-primary [&_.tone-title]:text-primary"
            : tone === "success"
              ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 hover:border-[hsl(var(--success))]/50 [&_.tone-icon]:text-[hsl(var(--success))] [&_.tone-title]:text-[hsl(var(--success))]"
              : "border-destructive/30 bg-destructive/5 hover:border-destructive/50 hover:bg-destructive/10 [&_.tone-icon]:text-destructive [&_.tone-title]:text-destructive";
    return (
        <section className="max-w-6xl mx-auto px-6 py-4">
            <Link
                to={config.link_url || "/"}
                className={`flex items-center gap-3 rounded-md border px-5 py-4 transition-colors ${cls}`}
                data-testid="section-emergency-cta"
            >
                <WarningCircle size={22} weight="duotone" className="tone-icon flex-shrink-0" />
                <div className="flex-1">
                    <p className="text-sm font-semibold tone-title">{config.title}</p>
                    {config.body && (
                        <p className="text-xs text-muted-foreground">{config.body}</p>
                    )}
                </div>
                <span className="text-sm font-medium tone-title">
                    {config.link_label || "Läs mer"} →
                </span>
            </Link>
        </section>
    );
}

function FeaturesSection({ config }) {
    const items = config.items || [];
    return (
        <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
            {items.map((item, i) => {
                const Icon = ICON_MAP[item.icon] || Feather;
                return (
                    <div key={i} className="surface p-6 fade-in" data-testid={`feature-card-${i}`}>
                        <div
                            className="w-10 h-10 rounded-md flex items-center justify-center mb-4"
                            style={{ background: "hsl(var(--primary) / 0.12)" }}
                        >
                            <Icon size={22} weight="duotone" className="text-primary" />
                        </div>
                        <h3 className="font-display font-bold text-lg">{item.title}</h3>
                        <p className="text-sm text-muted-foreground mt-2">{item.text}</p>
                    </div>
                );
            })}
        </section>
    );
}

function TextBlock({ config }) {
    return (
        <section className="max-w-3xl mx-auto px-6 py-16" data-testid="section-text-block">
            {config.title && (
                <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-4">
                    {config.title}
                </h2>
            )}
            {config.content && (
                <p className="text-lg text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {config.content}
                </p>
            )}
        </section>
    );
}

function CtaBanner({ config }) {
    return (
        <section className="max-w-6xl mx-auto px-6 py-16" data-testid="section-cta-banner">
            <div className="surface p-8 md:p-12 text-center bg-gradient-to-br from-primary/5 to-primary/0">
                {config.title && (
                    <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-3">
                        {config.title}
                    </h2>
                )}
                {config.body && (
                    <p className="text-base text-muted-foreground mb-6 max-w-xl mx-auto">{config.body}</p>
                )}
                {config.link_label && (
                    <Link to={config.link_url || "/"}>
                        <Button size="lg" data-testid="button-cta-banner">
                            {config.link_label}
                            <ArrowRight size={16} className="ml-2" />
                        </Button>
                    </Link>
                )}
            </div>
        </section>
    );
}

function renderSection(section, ctx) {
    const config = section.config || {};
    switch (section.type) {
        case "hero":
            return <HeroSection key={section.id} config={config} {...ctx} />;
        case "emergency_cta":
            return <EmergencyCta key={section.id} config={config} />;
        case "features":
            return <FeaturesSection key={section.id} config={config} />;
        case "text_block":
            return <TextBlock key={section.id} config={config} />;
        case "cta_banner":
            return <CtaBanner key={section.id} config={config} />;
        default:
            return null;
    }
}

export default function Landing() {
    const { user, isAdmin } = useAuth();
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/homepage")
            .then(({ data }) => setSections(data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card/80 backdrop-blur">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-9 h-9 rounded-md flex items-center justify-center"
                            style={{ background: "hsl(var(--primary))" }}
                        >
                            <Feather size={20} weight="duotone" color="#fff" />
                        </div>
                        <span className="font-display font-bold">Papegojregistret</span>
                    </div>
                    <nav className="flex items-center gap-1 sm:gap-3">
                        <Link to="/galleri" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2" data-testid="link-gallery">Galleri</Link>
                        <Link to="/hittade-faglar" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2" data-testid="link-found-list">Hittade fåglar</Link>
                        <Link to="/rapportera-bortflygen" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 hidden sm:inline-block" data-testid="link-report-missing">Bortflögen fågel</Link>
                        <Link to="/rapportera-hittad" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 hidden sm:inline-block" data-testid="link-report">Rapportera fynd</Link>
                        {user ? (
                            <>
                                <Link to="/mina-faglar">
                                    <Button size="sm" variant="outline" data-testid="button-my-birds">Mina inlägg</Button>
                                </Link>
                                {isAdmin && (
                                    <Link to="/admin">
                                        <Button size="sm" data-testid="button-goto-admin">Admin</Button>
                                    </Link>
                                )}
                            </>
                        ) : (
                            <Link to="/login">
                                <Button size="sm" variant="outline" data-testid="button-login-nav">
                                    <SignIn size={16} className="mr-1.5" /> Logga in
                                </Button>
                            </Link>
                        )}
                    </nav>
                </div>
            </header>

            {loading && (
                <div className="max-w-6xl mx-auto px-6 py-20 text-center text-muted-foreground">
                    Laddar…
                </div>
            )}

            {!loading && sections.length === 0 && (
                <div className="max-w-3xl mx-auto px-6 py-20 text-center">
                    <p className="label-caps mb-3">Startsida</p>
                    <h1 className="text-3xl font-display font-bold">Välkommen till Papegojregistret</h1>
                    <p className="text-muted-foreground mt-3">
                        Startsidan konfigureras av admin. Kika förbi{" "}
                        <Link to="/galleri" className="text-primary underline-offset-2 hover:underline">galleriet</Link>{" "}
                        i mellantiden.
                    </p>
                </div>
            )}

            {!loading &&
                sections.map((section) => (
                    <div key={section.id} data-testid={`homepage-section-${section.id}`}>
                        {renderSection(section, { user, isAdmin })}
                    </div>
                ))}

            <PublicFooter />
        </div>
    );
}
