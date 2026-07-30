import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { toast } from "sonner";
import { EnvelopeSimple, LockKey, GoogleLogo, ArrowRight } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { useSiteText } from "@/context/SiteTextsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
    const { login, register, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mode, setMode] = useState("login"); // login | register
    const [form, setForm] = useState({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        totp_code: "",
    });
    const [needsTotp, setNeedsTotp] = useState(false);
    const [busy, setBusy] = useState(false);

    const eyebrowText = useSiteText("login.eyebrow", "Adminportal");
    const loginTitle = useSiteText("login.title", "Välkommen tillbaka");
    const registerTitle = useSiteText("login.register_title", "Skapa konto");
    const loginSubtitle = useSiteText("login.subtitle", "Logga in för att hantera registret.");
    const registerSubtitle = useSiteText("login.register_subtitle", "Fyll i dina uppgifter för att komma igång.");
    const googleButton = useSiteText("login.google_button", "Fortsätt med Google");
    const dividerText = useSiteText("login.divider", "eller");
    const forgotText = useSiteText("login.forgot_password", "Glömt lösenord?");
    const submitLogin = useSiteText("login.submit_login", "Logga in");
    const submitRegister = useSiteText("login.submit_register", "Skapa konto");
    const heroEyebrow = useSiteText("login.hero.eyebrow", "Sveriges papegojregister");
    const heroTitle = useSiteText("login.hero.title", "Håll registret levande — och våra fåglar säkra.");
    const heroSubtitle = useSiteText(
        "login.hero.subtitle",
        "Från ringnummer till återförening. Ett verktyg för ägare och volontärer runt om i landet.",
    );
    const copyright = useSiteText("footer.copyright", `© ${new Date().getFullYear()} Fågelregister`);

    useEffect(() => {
        if (user && user.role) {
            const to = user.role === "admin" ? "/admin" : "/";
            navigate(to, { replace: true });
        }
    }, [user, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const u =
                mode === "login"
                    ? await login(form.email, form.password, form.totp_code || undefined)
                    : await register(form);
            toast.success(mode === "login" ? "Inloggad!" : "Konto skapat!");
            const from = location.state?.from;
            const to = u.role === "admin" ? "/admin" : from || "/";
            navigate(to, { replace: true });
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail && typeof detail === "object" && detail.code === "TOTP_REQUIRED") {
                setNeedsTotp(true);
                toast.info(detail.message || "Ange 6-siffrig kod från din authenticator-app");
            } else {
                toast.error(formatApiError(err));
            }
        } finally {
            setBusy(false);
        }
    };

    const handleGoogle = () => {
        // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
        const redirectUrl = window.location.origin + "/admin";
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-background">
            {/* Left – form */}
            <div className="flex flex-col justify-between px-8 lg:px-16 py-10">
                <Link to="/" className="flex items-center gap-3 flex-shrink-0" aria-label="Till startsidan" data-testid="login-logo">
                    <img
                        src="/images/fagelregister-logo.png"
                        alt="Fågelregister"
                        className="h-11 w-auto"
                    />
                </Link>

                <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center py-10">
                    <p className="label-caps mb-3">{eyebrowText}</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-2" data-testid="login-title">
                        {mode === "login" ? loginTitle : registerTitle}
                    </h1>
                    <p className="text-muted-foreground mb-8" data-testid="login-subtitle">
                        {mode === "login" ? loginSubtitle : registerSubtitle}
                    </p>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full mb-6 h-11 border-border"
                        onClick={handleGoogle}
                        data-testid="button-google-login"
                    >
                        <GoogleLogo size={20} weight="bold" className="mr-2" />
                        {googleButton}
                    </Button>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs uppercase tracking-widest text-muted-foreground">
                            {dividerText}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {mode === "register" && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="fn">Förnamn</Label>
                                    <Input
                                        id="fn"
                                        data-testid="input-first-name"
                                        value={form.first_name}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                first_name: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="ln">Efternamn</Label>
                                    <Input
                                        id="ln"
                                        data-testid="input-last-name"
                                        value={form.last_name}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                last_name: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        )}
                        <div>
                            <Label htmlFor="email">E-post</Label>
                            <div className="relative">
                                <EnvelopeSimple
                                    size={18}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    className="pl-10 h-11"
                                    placeholder="din@epost.se"
                                    autoComplete="email"
                                    data-testid="input-email"
                                    value={form.email}
                                    onChange={(e) =>
                                        setForm({ ...form, email: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="password">Lösenord</Label>
                            <div className="relative">
                                <LockKey
                                    size={18}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    minLength={6}
                                    autoComplete={
                                        mode === "login"
                                            ? "current-password"
                                            : "new-password"
                                    }
                                    className="pl-10 h-11"
                                    placeholder={mode === "register" ? "Minst 10 tecken, stor + liten bokstav, siffra, specialtecken" : "Minst 6 tecken"}
                                    data-testid="input-password"
                                    value={form.password}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            password: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            {mode === "login" && (
                                <div className="mt-1.5 text-right">
                                    <Link
                                        to="/glomt-losenord"
                                        className="text-xs text-muted-foreground hover:text-primary"
                                        data-testid="link-forgot-password"
                                    >
                                        {forgotText}
                                    </Link>
                                </div>
                            )}
                        </div>
                        {needsTotp && mode === "login" && (
                            <div>
                                <label className="text-sm font-medium">
                                    Kod från authenticator (6 siffror)
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={8}
                                    className="mt-1 w-full h-11 px-3 rounded-md border border-input bg-background text-center text-lg tracking-widest font-mono"
                                    placeholder="123456"
                                    value={form.totp_code}
                                    onChange={(e) =>
                                        setForm({ ...form, totp_code: e.target.value })
                                    }
                                    data-testid="input-totp-code"
                                    autoFocus
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Öppna din authenticator-app och ange den 6-siffriga koden.
                                </p>
                            </div>
                        )}
                        <Button
                            type="submit"
                            disabled={busy}
                            className="w-full h-11 bg-primary hover:bg-primary/90"
                            data-testid="button-submit-auth"
                        >
                            {busy ? "Vänta…" : mode === "login" ? submitLogin : submitRegister}
                            <ArrowRight size={18} className="ml-2" />
                        </Button>
                    </form>

                    <p className="text-sm text-muted-foreground mt-6 text-center">
                        {mode === "login" ? (
                            <>
                                Har du inget konto?{" "}
                                <button
                                    className="text-primary font-medium underline-offset-2 hover:underline"
                                    onClick={() => setMode("register")}
                                    data-testid="button-switch-register"
                                >
                                    Skapa ett
                                </button>
                            </>
                        ) : (
                            <>
                                Redan medlem?{" "}
                                <button
                                    className="text-primary font-medium underline-offset-2 hover:underline"
                                    onClick={() => setMode("login")}
                                    data-testid="button-switch-login"
                                >
                                    Logga in
                                </button>
                            </>
                        )}
                    </p>

                    <Link
                        to="/"
                        className="text-xs text-muted-foreground text-center block mt-6 hover:text-foreground"
                        data-testid="link-back-home"
                    >
                        ← Tillbaka till startsidan
                    </Link>
                </div>

                <p className="text-xs text-muted-foreground">{copyright}</p>
            </div>

            {/* Right – image */}
            <div
                className="hidden lg:block relative overflow-hidden"
                style={{
                    backgroundImage:
                        "url('https://images.unsplash.com/photo-1440581572325-0bea30075d9d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwxfHxzd2VkaXNoJTIwZm9yZXN0JTIwc3VidGxlJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODM5NDQzMTZ8MA&ixlib=rb-4.1.0&q=85')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <div className="absolute inset-0 bg-black/40" />
                <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
                    <p className="label-caps text-white/70 mb-2">{heroEyebrow}</p>
                    <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight max-w-md">
                        {heroTitle}
                    </h2>
                    <p className="text-white/80 mt-4 max-w-md">{heroSubtitle}</p>
                </div>
            </div>
        </div>
    );
}
