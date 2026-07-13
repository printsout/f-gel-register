import { Link } from "react-router-dom";
import { Feather, Shield, MagnifyingGlass, ArrowRight, MapPin, SignIn } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export default function Landing() {
    const { user, isAdmin } = useAuth();
    return (
        <div className="min-h-screen bg-background">
            {/* Top bar */}
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
                        <Link
                            to="/galleri"
                            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2"
                            data-testid="link-gallery"
                        >
                            Galleri
                        </Link>
                        <Link
                            to="/hittade-faglar"
                            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2"
                            data-testid="link-found-list"
                        >
                            Hittade fåglar
                        </Link>
                        <Link
                            to="/rapportera-hittad"
                            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 hidden sm:inline-block"
                            data-testid="link-report"
                        >
                            Rapportera fynd
                        </Link>
                        {user ? (
                            <>
                                <Link to="/mina-faglar">
                                    <Button size="sm" variant="outline" data-testid="button-my-birds">
                                        Mina fåglar
                                    </Button>
                                </Link>
                                {isAdmin && (
                                    <Link to="/admin">
                                        <Button size="sm" data-testid="button-goto-admin">
                                            Admin
                                        </Button>
                                    </Link>
                                )}
                            </>
                        ) : (
                            <Link to="/login">
                                <Button size="sm" variant="outline" data-testid="button-login-nav">
                                    <SignIn size={16} className="mr-1.5" />
                                    Logga in
                                </Button>
                            </Link>
                        )}
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="max-w-6xl mx-auto px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
                <div>
                    <p className="label-caps mb-4">Sveriges papegojregister</p>
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-[1.05]">
                        Ringnummer.
                        <br />
                        Återförening.
                        <br />
                        <span className="text-primary">Papegojregistret.</span>
                    </h1>
                    <p className="text-lg text-muted-foreground mt-6 max-w-lg">
                        Registrera din papegoja med ringnummer och gör det möjligt
                        för volontärer att återförena er om fågeln försvinner.
                    </p>
                    <div className="flex flex-wrap gap-3 mt-8">
                        <Link to="/registrera-fagel">
                            <Button size="lg" className="h-12 px-6" data-testid="button-hero-register">
                                Registrera fågel
                                <ArrowRight size={18} className="ml-2" />
                            </Button>
                        </Link>
                        <Link to="/galleri">
                            <Button size="lg" variant="outline" className="h-12 px-6" data-testid="button-hero-gallery">
                                Se galleriet
                            </Button>
                        </Link>
                        <Link to="/rapportera-hittad">
                            <Button size="lg" variant="ghost" className="h-12 px-6" data-testid="button-hero-found">
                                <MapPin size={18} className="mr-2" />
                                Rapportera hittad
                            </Button>
                        </Link>
                    </div>
                </div>
                <div
                    className="relative aspect-[4/5] rounded-lg overflow-hidden hidden lg:block"
                    style={{
                        backgroundImage:
                            "url('https://images.unsplash.com/photo-1606383069718-104a95938112?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHw0fHxwYXJyb3QlMjBpbiUyMG5hdHVyZSUyMHBvcnRyYWl0fGVufDB8fHx8MTc4Mzk0NDMxNnww&ixlib=rb-4.1.0&q=85')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                >
                    <div className="absolute bottom-6 left-6 right-6 p-5 rounded-md bg-card/90 backdrop-blur border border-border">
                        <p className="label-caps mb-1">Registrerade fåglar</p>
                        <p className="font-display text-2xl font-bold">
                            Skydd genom gemenskap
                        </p>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
                {[
                    {
                        icon: Shield,
                        title: "Säker registrering",
                        text: "Ringnummer, ägaruppgifter och kontaktinfo lagras enligt GDPR.",
                    },
                    {
                        icon: MagnifyingGlass,
                        title: "Rapportera fynd",
                        text: "Hittad papegoja? Rapportera på 30 sekunder — utan konto.",
                    },
                    {
                        icon: Feather,
                        title: "Enkel avgift",
                        text: "300 kr per fågel + 100 kr/år för hela flocken. Ingen krångel.",
                    },
                ].map(({ icon: Icon, title, text }) => (
                    <div key={title} className="surface p-6 fade-in">
                        <div
                            className="w-10 h-10 rounded-md flex items-center justify-center mb-4"
                            style={{ background: "hsl(var(--primary) / 0.12)" }}
                        >
                            <Icon size={22} weight="duotone" className="text-primary" />
                        </div>
                        <h3 className="font-display font-bold text-lg">{title}</h3>
                        <p className="text-sm text-muted-foreground mt-2">{text}</p>
                    </div>
                ))}
            </section>

            <footer className="border-t border-border py-8">
                <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} Papegojregistret
                    </p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                        <a href="mailto:info@papegojregistret.se">info@papegojregistret.se</a>
                        <span>0768 48 80 91</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
