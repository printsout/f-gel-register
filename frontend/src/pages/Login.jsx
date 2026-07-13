import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { toast } from "sonner";
import { Feather, EnvelopeSimple, LockKey, GoogleLogo, ArrowRight } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
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
    });
    const [busy, setBusy] = useState(false);

    if (user && user.role) {
        const to = user.role === "admin" ? "/admin" : "/";
        navigate(to, { replace: true });
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const u =
                mode === "login"
                    ? await login(form.email, form.password)
                    : await register(form);
            toast.success(mode === "login" ? "Inloggad!" : "Konto skapat!");
            const from = location.state?.from;
            const to = u.role === "admin" ? "/admin" : from || "/";
            navigate(to, { replace: true });
        } catch (err) {
            toast.error(formatApiError(err));
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
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-md flex items-center justify-center"
                        style={{ background: "hsl(var(--primary))" }}
                    >
                        <Feather size={22} weight="duotone" color="#fff" />
                    </div>
                    <span className="font-display font-bold text-lg">
                        Papegojregistret
                    </span>
                </div>

                <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center py-10">
                    <p className="label-caps mb-3">Admin­portal</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-2">
                        {mode === "login" ? "Välkommen tillbaka" : "Skapa konto"}
                    </h1>
                    <p className="text-muted-foreground mb-8">
                        {mode === "login"
                            ? "Logga in för att hantera registret."
                            : "Fyll i dina uppgifter för att komma igång."}
                    </p>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full mb-6 h-11 border-border"
                        onClick={handleGoogle}
                        data-testid="button-google-login"
                    >
                        <GoogleLogo size={20} weight="bold" className="mr-2" />
                        Fortsätt med Google
                    </Button>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs uppercase tracking-widest text-muted-foreground">
                            eller
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
                                    placeholder="Minst 6 tecken"
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
                        </div>
                        <Button
                            type="submit"
                            disabled={busy}
                            className="w-full h-11 bg-primary hover:bg-primary/90"
                            data-testid="button-submit-auth"
                        >
                            {busy
                                ? "Vänta…"
                                : mode === "login"
                                  ? "Logga in"
                                  : "Skapa konto"}
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

                <p className="text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Papegojregistret
                </p>
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
                    <p className="label-caps text-white/70 mb-2">
                        Sveriges papegojregister
                    </p>
                    <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight max-w-md">
                        Håll registret levande — och våra fåglar säkra.
                    </h2>
                    <p className="text-white/80 mt-4 max-w-md">
                        Från ringnummer till återförening. Ett verktyg för ägare
                        och volontärer runt om i landet.
                    </p>
                </div>
            </div>
        </div>
    );
}
