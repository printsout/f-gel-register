import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle, Warning, Key, ArrowRight, Spinner } from "@phosphor-icons/react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import PublicFooter from "@/components/PublicFooter";
import BackHeader from "@/components/BackHeader";

const MAX_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

export default function PaymentSuccess() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const sessionId = params.get("session_id");
    const [status, setStatus] = useState("checking"); // checking | paid | timeout | error
    const [attempts, setAttempts] = useState(0);
    const [account, setAccount] = useState(null);
    const cancelledRef = useRef(false);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem("pending_account");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (!sessionId || parsed.session_id === sessionId) {
                    setAccount(parsed);
                }
            }
        } catch (_) {
            /* ignore */
        }
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId) {
            setStatus("error");
            return;
        }
        cancelledRef.current = false;
        let currentAttempt = 0;

        const poll = async () => {
            if (cancelledRef.current) return;
            currentAttempt += 1;
            setAttempts(currentAttempt);
            try {
                const { data } = await api.get(`/payments/status/${sessionId}`);
                if (data.payment_status === "paid") {
                    setStatus("paid");
                    try {
                        sessionStorage.removeItem("pending_account");
                    } catch (_) {
                        /* ignore */
                    }
                    return;
                }
                if (["failed", "expired"].includes(data.payment_status)) {
                    setStatus("error");
                    return;
                }
            } catch (_) {
                if (currentAttempt >= MAX_ATTEMPTS) {
                    setStatus("timeout");
                    return;
                }
            }
            if (currentAttempt >= MAX_ATTEMPTS) {
                setStatus("timeout");
                return;
            }
            setTimeout(poll, POLL_INTERVAL_MS);
        };
        poll();
        return () => {
            cancelledRef.current = true;
        };
    }, [sessionId]);

    return (
        <div className="min-h-screen bg-background">
            <BackHeader label="Betalning" />
            <div className="max-w-xl mx-auto px-6 py-14">
                <div
                    className="surface p-8 text-center space-y-4"
                    data-testid="payment-success-card"
                >
                    {status === "checking" && (
                        <>
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                                <Spinner
                                    size={32}
                                    weight="duotone"
                                    className="text-primary animate-spin"
                                />
                            </div>
                            <h1 className="text-2xl font-display font-bold">
                                Bekräftar betalning…
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Vi verifierar din betalning hos Stripe. Detta tar
                                normalt bara några sekunder.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Försök {attempts} / {MAX_ATTEMPTS}
                            </p>
                        </>
                    )}

                    {status === "paid" && (
                        <>
                            <div className="w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto">
                                <CheckCircle
                                    size={36}
                                    weight="duotone"
                                    className="text-[hsl(var(--success))]"
                                />
                            </div>
                            <h1
                                className="text-2xl font-display font-bold"
                                data-testid="payment-success-title"
                            >
                                Tack — din betalning är klar!
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Din fågel är nu registrerad och ditt medlemskap är
                                aktivt. Ett kvitto skickas till din e-post från
                                Stripe.
                            </p>

                            {account?.temp_password && (
                                <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4 text-left">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Key
                                            size={16}
                                            weight="duotone"
                                            className="text-primary"
                                        />
                                        <p className="text-sm font-semibold">
                                            Ditt konto är skapat
                                        </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Spara dessa inloggningsuppgifter — byt
                                        lösenord efter första inloggning.
                                    </p>
                                    <div className="text-sm space-y-1 font-mono bg-card p-3 rounded border border-border">
                                        <div>
                                            <span className="text-muted-foreground">
                                                E-post:
                                            </span>{" "}
                                            {account.email}
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">
                                                Lösenord:
                                            </span>{" "}
                                            <span data-testid="temp-password">
                                                {account.temp_password}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                                <Button
                                    onClick={() => navigate("/login")}
                                    data-testid="button-login"
                                    className="gap-2"
                                >
                                    Logga in <ArrowRight size={16} />
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => navigate("/")}
                                    data-testid="button-go-home"
                                >
                                    Till startsidan
                                </Button>
                            </div>
                        </>
                    )}

                    {status === "timeout" && (
                        <>
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                                <Spinner
                                    size={32}
                                    weight="duotone"
                                    className="text-primary"
                                />
                            </div>
                            <h1 className="text-2xl font-display font-bold">
                                Betalningen bearbetas fortfarande
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Din bank behöver lite mer tid. Du får en
                                bekräftelse via e-post från Stripe så snart
                                betalningen är klar.
                            </p>
                            <div className="flex justify-center pt-2">
                                <Link to="/">
                                    <Button
                                        variant="outline"
                                        data-testid="button-timeout-home"
                                    >
                                        Till startsidan
                                    </Button>
                                </Link>
                            </div>
                        </>
                    )}

                    {status === "error" && (
                        <>
                            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                                <Warning
                                    size={32}
                                    weight="duotone"
                                    className="text-destructive"
                                />
                            </div>
                            <h1 className="text-2xl font-display font-bold">
                                Något gick fel med betalningen
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Vi kunde inte bekräfta din betalning. Kontakta
                                oss om problemet kvarstår.
                            </p>
                            <div className="flex justify-center pt-2">
                                <Link to="/registrera-fagel">
                                    <Button data-testid="button-retry-register">
                                        Försök igen
                                    </Button>
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <PublicFooter />
        </div>
    );
}
