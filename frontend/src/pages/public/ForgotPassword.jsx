import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EnvelopeSimple, CheckCircle, ArrowLeft } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BackHeader from "@/components/BackHeader";
import PublicFooter from "@/components/PublicFooter";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post("/auth/forgot-password", { email });
            setSent(true);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <BackHeader label="Återställ lösenord" />
            <div className="max-w-md mx-auto px-6 py-14">
                {sent ? (
                    <div
                        className="surface p-8 text-center space-y-4"
                        data-testid="forgot-sent"
                    >
                        <div className="w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto">
                            <CheckCircle
                                size={32}
                                weight="duotone"
                                className="text-[hsl(var(--success))]"
                            />
                        </div>
                        <h1 className="text-2xl font-display font-bold">
                            Kolla din inkorg
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Om <strong>{email}</strong> finns registrerad har vi
                            skickat en återställningslänk. Länken är giltig i 60
                            minuter.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Ser du inte mailet? Kolla i skräpposten.
                        </p>
                        <div className="pt-2">
                            <Link to="/login">
                                <Button
                                    variant="outline"
                                    data-testid="button-back-to-login"
                                >
                                    Tillbaka till inloggning
                                </Button>
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className="surface p-8 fade-in">
                        <div className="mb-6">
                            <p className="label-caps mb-2">Kontoåterställning</p>
                            <h1 className="text-2xl font-display font-bold">
                                Glömt ditt lösenord?
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                Skriv in din e-postadress så skickar vi en
                                återställningslänk till dig.
                            </p>
                        </div>
                        <form
                            onSubmit={submit}
                            className="space-y-4"
                            data-testid="forgot-form"
                        >
                            <div>
                                <Label htmlFor="email">E-postadress</Label>
                                <div className="relative mt-1">
                                    <EnvelopeSimple
                                        size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <Input
                                        id="email"
                                        type="email"
                                        required
                                        className="pl-9"
                                        placeholder="din@epost.se"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        data-testid="forgot-input-email"
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-11"
                                disabled={busy || !email}
                                data-testid="forgot-submit"
                            >
                                {busy ? "Skickar…" : "Skicka återställningslänk"}
                            </Button>
                        </form>
                        <div className="mt-5 text-center">
                            <Link
                                to="/login"
                                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                                data-testid="link-back-to-login"
                            >
                                <ArrowLeft size={14} /> Tillbaka till inloggning
                            </Link>
                        </div>
                    </div>
                )}
            </div>
            <PublicFooter />
        </div>
    );
}
