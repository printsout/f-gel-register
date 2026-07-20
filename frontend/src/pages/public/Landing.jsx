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
import PublicHeader from "@/components/PublicHeader";
import { styleFor } from "@/components/StyleControls";
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
    const s = config.style || {};
    const titleStyle = styleFor(s, "title");
    const bodyStyle = styleFor(s, "text");
    const disc = config.discount || {};
    const showBubble = disc.enabled && (
        disc.title || disc.subtitle || disc.value != null || disc.type === "custom"
    );
    const pos = disc.position || "top-right";
    const posClass = {
        "top-right": "top-4 right-4",
        "top-left": "top-4 left-4",
        "bottom-right": "bottom-4 right-4",
        "bottom-left": "bottom-4 left-4",
    }[pos] || "top-4 right-4";

    // Bubble size classes
    const size = disc.size || "md";
    const sizeMap = {
        sm: { box: "h-[72px] w-[72px] md:h-20 md:w-20", title: "text-xs md:text-sm", sub: "text-[9px] md:text-[10px]" },
        md: { box: "h-24 w-24 md:h-28 md:w-28", title: "text-base md:text-lg", sub: "text-[10px] md:text-xs" },
        lg: { box: "h-32 w-32 md:h-36 md:w-36", title: "text-xl md:text-2xl", sub: "text-xs md:text-sm" },
        xl: { box: "h-40 w-40 md:h-44 md:w-44", title: "text-2xl md:text-3xl", sub: "text-sm md:text-base" },
    };
    const sz = sizeMap[size] || sizeMap.md;

    // Derive title: for percent/amount always compute from value; for 'custom' use title.
    let bubbleTitle = null;
    if (disc.type === "custom") {
        bubbleTitle = disc.title;
    } else if (disc.type === "amount" && disc.value != null && disc.value !== "") {
        bubbleTitle = `${disc.value} KR`;
    } else if ((disc.type === "percent" || !disc.type) && disc.value != null && disc.value !== "") {
        bubbleTitle = `${disc.value}%`;
    } else {
        // fallback for legacy configs that only had disc.title
        bubbleTitle = disc.title;
    }
    // Add "RABATT" label under the value when it's a numeric one
    const isNumeric = disc.type !== "custom" && (disc.value != null && disc.value !== "");
    const label = isNumeric ? "RABATT" : null;

    const BubbleWrapper = disc.link ? Link : "div";
    // Append ?discount=CODE so RegisterBird auto-fills the linked code
    const bubbleHref = disc.link && disc.code
        ? `${disc.link}${disc.link.includes("?") ? "&" : "?"}discount=${encodeURIComponent(disc.code)}`
        : disc.link;
    const wrapperProps = disc.link ? { to: bubbleHref } : {};

    const bubbleNode = showBubble ? (
        <BubbleWrapper
            {...wrapperProps}
            className={`absolute z-10 ${posClass} inline-flex flex-col items-center justify-center ${sz.box} rounded-full shadow-lg rotate-[-8deg] hover:scale-105 hover:rotate-0 transition-transform ${disc.link ? "cursor-pointer" : ""}`}
            style={{
                background: disc.bg_color || "hsl(var(--primary))",
                color: disc.text_color || "#ffffff",
            }}
            data-testid="hero-discount-bubble"
        >
            {bubbleTitle && (
                <span className={`font-display font-black ${sz.title} leading-tight text-center px-2`}>
                    {bubbleTitle}
                </span>
            )}
            {label && (
                <span className={`${sz.sub} uppercase tracking-wider opacity-95 leading-none`}>
                    {label}
                </span>
            )}
            {disc.subtitle && (
                <span className={`${sz.sub} uppercase tracking-wider opacity-95 mt-0.5 text-center px-1`}>
                    {disc.subtitle}
                </span>
            )}
        </BubbleWrapper>
    ) : null;

    return (
        <section
            className="max-w-6xl mx-auto px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center"
            style={s.font_family && s.font_family !== "__default" ? { fontFamily: s.font_family } : undefined}
        >
            <div className="relative">
                {config.eyebrow && <p className="label-caps mb-4" style={bodyStyle}>{config.eyebrow}</p>}
                <h1
                    className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-[1.05]"
                    style={titleStyle}
                >
                    {highlightTitle(config.title, config.highlighted_word)}
                </h1>
                {config.body && (
                    <p className="text-lg text-muted-foreground mt-6 max-w-lg" style={bodyStyle}>{config.body}</p>
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
                {!config.image_url && bubbleNode}
            </div>
            {config.image_url && (
                <div
                    className="relative aspect-[4/5] rounded-lg overflow-hidden hidden lg:block"
                    style={{ backgroundImage: `url('${config.image_url}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                >
                    {bubbleNode}
                    <div className="absolute bottom-6 left-6 right-6 p-5 rounded-md bg-card/90 backdrop-blur border border-border">
                        <p className="label-caps mb-1">{config.eyebrow || "Fågelregister"}</p>
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
                const inner = (
                    <>
                        <div
                            className="w-10 h-10 rounded-md flex items-center justify-center mb-4"
                            style={{ background: "hsl(var(--primary) / 0.12)" }}
                        >
                            <Icon size={22} weight="duotone" className="text-primary" />
                        </div>
                        <h3 className="font-display font-bold text-lg">{item.title}</h3>
                        <p className="text-sm text-muted-foreground mt-2">{item.text}</p>
                    </>
                );
                if (item.link) {
                    return (
                        <Link
                            key={i}
                            to={item.link}
                            className="surface p-6 fade-in block hover:shadow-md hover:-translate-y-0.5 transition-all"
                            data-testid={`feature-card-${i}`}
                        >
                            {inner}
                        </Link>
                    );
                }
                return (
                    <div key={i} className="surface p-6 fade-in" data-testid={`feature-card-${i}`}>
                        {inner}
                    </div>
                );
            })}
        </section>
    );
}

function TextBlock({ config }) {
    const s = config.style || {};
    const sectionStyle = s.font_family && s.font_family !== "__default"
        ? { fontFamily: s.font_family }
        : undefined;
    const html = config.content_html;
    return (
        <section
            className="max-w-3xl mx-auto px-6 py-16"
            data-testid="section-text-block"
            style={sectionStyle}
        >
            {config.title && (
                <h2
                    className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-4"
                    style={styleFor(s, "title")}
                >
                    {config.title}
                </h2>
            )}
            {html ? (
                <div
                    className="text-lg text-muted-foreground leading-relaxed rte-content"
                    style={styleFor(s, "text")}
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            ) : (
                config.content && (
                    <p
                        className="text-lg text-muted-foreground whitespace-pre-wrap leading-relaxed"
                        style={styleFor(s, "text")}
                    >
                        {config.content}
                    </p>
                )
            )}
        </section>
    );
}

function CtaBanner({ config }) {
    const s = config.style || {};
    const sectionStyle = s.font_family && s.font_family !== "__default"
        ? { fontFamily: s.font_family }
        : undefined;
    return (
        <section
            className="max-w-6xl mx-auto px-6 py-16"
            data-testid="section-cta-banner"
            style={sectionStyle}
        >
            <div className="surface p-8 md:p-12 text-center bg-gradient-to-br from-primary/5 to-primary/0">
                {config.title && (
                    <h2
                        className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-3"
                        style={styleFor(s, "title")}
                    >
                        {config.title}
                    </h2>
                )}
                {config.body && (
                    <p
                        className="text-base text-muted-foreground mb-6 max-w-xl mx-auto"
                        style={styleFor(s, "text")}
                    >
                        {config.body}
                    </p>
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
            <PublicHeader />

            {loading && (
                <div className="max-w-6xl mx-auto px-6 py-20 text-center text-muted-foreground">
                    Laddar…
                </div>
            )}

            {!loading && sections.length === 0 && (
                <div className="max-w-3xl mx-auto px-6 py-20 text-center">
                    <p className="label-caps mb-3">Startsida</p>
                    <h1 className="text-3xl font-display font-bold">Välkommen till Fågelregister</h1>
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
