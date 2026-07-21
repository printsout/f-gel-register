import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { LockKey, CheckCircle, Eye, EyeSlash } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BackHeader from "@/components/BackHeader";
import PublicFooter from "@/components/PublicFooter";

export default function ResetPassword() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [pw1, setPw1] = useState("");
    const [pw2, setPw2] = useState("");
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (pw1.length < 6) {
            toast.error("Lösenordet måste vara minst 6 tecken.");
            return;
        }
        if (pw1 !== pw2) {
            toast.error("Lösenorden matchar inte.");
            return;
        }
        setBusy(true);
        try {
            await api.post("/auth/reset-password", {
                token,
                new_password: pw1,
            });
            setDone(true);
            setTimeout(() => navigate("/login"), 2500);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <BackHeader label="Nytt lösenord" />
            <div className="max-w-md mx-auto px-6 py-14">
                {done ? (
                    <div
                        className="surface p-8 text-center space-y-4"
                        data-testid="reset-done"
                    >
                        <div className="w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto">
                            <CheckCircle
                                size={32}
                                weight="duotone"
                                className="text-[hsl(var(--success))]"
                            />
                        </div>
                        <h1 className="text-2xl font-display font-bold">
                            Lösenordet är uppdaterat
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Skickar dig vidare till inloggning…
                        </p>
                        <Link to="/login">
                            <Button variant="outline" data-testid="button-go-login">
                                Logga in nu
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="surface p-8 fade-in">
                        <div className="mb-6">
                            <p className="label-caps mb-2">Välj nytt lösenord</p>
                            <h1 className="text-2xl font-display font-bold">
                                Skapa nytt lösenord
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                Minst 6 tecken. Använd gärna en mix av bokstäver,
                                siffror och specialtecken.
                            </p>
                        </div>
                        <form
                            onSubmit={submit}
                            className="space-y-4"
                            data-testid="reset-form"
                        >
                            <div>
                                <Label htmlFor="pw1">Nytt lösenord</Label>
                                <div className="relative mt-1">
                                    <LockKey
                                        size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <Input
                                        id="pw1"
                                        type={show ? "text" : "password"}
                                        required
                                        minLength={6}
                                        className="pl-9 pr-9"
                                        value={pw1}
                                        onChange={(e) => setPw1(e.target.value)}
                                        data-testid="reset-input-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShow((s) => !s)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label={show ? "Dölj lösenord" : "Visa lösenord"}
                                    >
                                        {show ? <EyeSlash size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="pw2">Bekräfta lösenord</Label>
                                <div className="relative mt-1">
                                    <LockKey
                                        size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <Input
                                        id="pw2"
                                        type={show ? "text" : "password"}
                                        required
                                        minLength={6}
                                        className="pl-9"
                                        value={pw2}
                                        onChange={(e) => setPw2(e.target.value)}
                                        data-testid="reset-input-confirm"
                                    />
                                </div>
                                {pw2 && pw1 !== pw2 && (
                                    <p className="text-xs text-destructive mt-1">
                                        Lösenorden matchar inte
                                    </p>
                                )}
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-11"
                                disabled={busy || !pw1 || !pw2}
                                data-testid="reset-submit"
                            >
                                {busy ? "Sparar…" : "Spara nytt lösenord"}
                            </Button>
                        </form>
                    </div>
                )}
            </div>
            <PublicFooter />
        </div>
    );
}
