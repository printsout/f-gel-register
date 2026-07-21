import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Bird } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import PublicFooter from "@/components/PublicFooter";
import SpeciesSelect from "@/components/SpeciesSelect";
import BackHeader from "@/components/BackHeader";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { ShieldCheck, Key, CheckCircle } from "@phosphor-icons/react";

export default function RegisterBird() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const [busy, setBusy] = useState(false);
    const [successData, setSuccessData] = useState(null);
    const [form, setForm] = useState({
        species: "",
        ring_number: "",
        owner_name: "",
        owner_email: "",
        phone_number: "",
        additional_info: "",
        discount_code: "",
        accept: false,
    });

    // Prefill discount_code from URL (?discount=CODE) — used by hero rabatt-bubbla
    useEffect(() => {
        const code = searchParams.get("discount");
        if (code) {
            setForm((f) => (f.discount_code ? f : { ...f, discount_code: code.toUpperCase() }));
            toast.success(`Rabattkod ${code.toUpperCase()} tillämpad!`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Live price calculation — validates the discount code with the backend as the
    // user types. Debounced. Shows total to the user before Stripe redirect.
    const [priceInfo, setPriceInfo] = useState({
        registration: 300,
        membership: user?.membership_active ? 0 : 100,
        discount_amount: 0,
        discount_percent: 0,
        discount_valid: null, // null | true | false
        discount_error: null,
    });
    useEffect(() => {
        const code = (form.discount_code || "").trim().toUpperCase();
        if (!code) {
            setPriceInfo((p) => ({
                ...p,
                discount_amount: 0,
                discount_percent: 0,
                discount_valid: null,
                discount_error: null,
            }));
            return;
        }
        const handle = setTimeout(async () => {
            try {
                const { data } = await api.post("/discount-codes/validate", { code });
                if (data.valid) {
                    const pct = Number(data.discount_percentage) || 0;
                    setPriceInfo((p) => ({
                        ...p,
                        discount_percent: pct,
                        discount_amount: Math.round(p.registration * (pct / 100)),
                        discount_valid: true,
                        discount_error: null,
                    }));
                } else {
                    setPriceInfo((p) => ({
                        ...p,
                        discount_amount: 0,
                        discount_percent: 0,
                        discount_valid: false,
                        discount_error: data.message || "Ogiltig rabattkod",
                    }));
                }
            } catch (_e) {
                setPriceInfo((p) => ({ ...p, discount_valid: false, discount_error: "Kunde inte verifiera koden" }));
            }
        }, 400);
        return () => clearTimeout(handle);
    }, [form.discount_code, user]);

    const total = Math.max(
        0,
        priceInfo.registration + priceInfo.membership - priceInfo.discount_amount,
    );

    const submit = async (e) => {
        e.preventDefault();
        if (!form.accept) {
            toast.error("Du måste acceptera villkoren.");
            return;
        }
        setBusy(true);
        try {
            const { accept, ...payload } = form;
            if (!payload.owner_email) delete payload.owner_email;
            payload.origin_url = window.location.origin;
            const { data } = await api.post("/registered-birds", payload);
            // Persist temp credentials so the success page can show them after redirect
            if (data.account_created && data.temp_password) {
                try {
                    sessionStorage.setItem(
                        "pending_account",
                        JSON.stringify({
                            email: data.account_email,
                            temp_password: data.temp_password,
                            session_id: data.session_id,
                        }),
                    );
                } catch (_) {
                    /* ignore quota errors */
                }
            }
            if (data.checkout_url) {
                window.location.assign(data.checkout_url);
                return;
            }
            setSuccessData({ ...data, wasLoggedIn: !!user });
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <BackHeader label="Registrera fågel" />
            <div className="max-w-2xl mx-auto px-6 py-10">
                <div className="mb-8 flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-md flex items-center justify-center"
                        style={{ background: "hsl(var(--primary) / 0.12)" }}
                    >
                        <Bird size={26} weight="duotone" className="text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-display font-bold">
                            Registrera din papegoja
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Fyll i uppgifter så din fågel finns i registret.
                        </p>
                    </div>
                </div>

                <form onSubmit={submit} className="surface p-6 space-y-5 fade-in">
                    <div>
                        <Label htmlFor="species">Fågelart *</Label>
                        <div className="mt-1">
                            <SpeciesSelect
                                value={form.species}
                                onChange={(v) => setForm({ ...form, species: v })}
                                testid="select-species"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Grupperat efter familj — skriv i sökrutan för att filtrera bland över 150 arter.
                        </p>
                    </div>
                    <div>
                        <Label htmlFor="ring">Ringnummer *</Label>
                        <Input
                            id="ring"
                            data-testid="input-ring-number"
                            required
                            placeholder="t.ex. SE123456789"
                            value={form.ring_number}
                            onChange={(e) =>
                                setForm({ ...form, ring_number: e.target.value.toUpperCase().replace(/\s+/g, "") })
                            }
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Ringnumret är unikt — samma nummer kan inte registreras två gånger.
                        </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="owner">Ägarens namn *</Label>
                            <Input
                                id="owner"
                                data-testid="input-owner-name"
                                required
                                value={form.owner_name}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        owner_name: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div>
                            <Label htmlFor="phone">Telefon *</Label>
                            <Input
                                id="phone"
                                data-testid="input-phone-number"
                                required
                                type="tel"
                                placeholder="0701234567"
                                value={form.phone_number}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        phone_number: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                    {!user && (
                        <div>
                            <Label htmlFor="email">
                                E-post *
                                <span className="text-xs text-muted-foreground font-normal ml-1">
                                    (ett konto skapas åt dig)
                                </span>
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                required
                                data-testid="input-owner-email"
                                placeholder="din@epost.se"
                                value={form.owner_email}
                                onChange={(e) =>
                                    setForm({ ...form, owner_email: e.target.value })
                                }
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Vi skapar ett konto automatiskt så du kan hantera din fågel och årsavgift.
                            </p>
                        </div>
                    )}
                    <div>
                        <Label htmlFor="info">Ytterligare info</Label>
                        <Textarea
                            id="info"
                            rows={3}
                            data-testid="input-additional-info"
                            value={form.additional_info}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    additional_info: e.target.value,
                                })
                            }
                        />
                    </div>
                    <div>
                        <Label htmlFor="dc">Rabattkod (valfritt)</Label>
                        <Input
                            id="dc"
                            data-testid="input-discount-code"
                            placeholder="t.ex. PARROTS15"
                            value={form.discount_code}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    discount_code: e.target.value,
                                })
                            }
                        />
                        {priceInfo.discount_valid === true && (
                            <p
                                className="text-xs text-[hsl(var(--success))] mt-1"
                                data-testid="discount-status-valid"
                            >
                                ✓ Rabattkod giltig — {priceInfo.discount_percent}% avdrag
                            </p>
                        )}
                        {priceInfo.discount_valid === false && (
                            <p
                                className="text-xs text-destructive mt-1"
                                data-testid="discount-status-invalid"
                            >
                                {priceInfo.discount_error}
                            </p>
                        )}
                    </div>

                    {/* Live price summary */}
                    <div
                        className="rounded-md border border-border bg-muted/40 p-4 space-y-2 text-sm"
                        data-testid="price-summary"
                    >
                        <p className="label-caps text-xs">Beräknad kostnad</p>
                        <div className="flex justify-between">
                            <span>Registreringsavgift (1 fågel)</span>
                            <span data-testid="price-registration">
                                {priceInfo.registration} kr
                            </span>
                        </div>
                        {priceInfo.discount_amount > 0 && (
                            <div className="flex justify-between text-[hsl(var(--success))]">
                                <span>
                                    Rabatt ({priceInfo.discount_percent}%)
                                </span>
                                <span data-testid="price-discount">
                                    −{priceInfo.discount_amount} kr
                                </span>
                            </div>
                        )}
                        {priceInfo.membership > 0 && (
                            <div className="flex justify-between">
                                <span>Medlemskap första året</span>
                                <span data-testid="price-membership">
                                    {priceInfo.membership} kr
                                </span>
                            </div>
                        )}
                        {priceInfo.membership === 0 && user?.membership_active && (
                            <div className="flex justify-between text-muted-foreground text-xs">
                                <span>Medlemskap</span>
                                <span>Aktivt (ingen avgift)</span>
                            </div>
                        )}
                        <div className="border-t border-border pt-2 flex justify-between font-semibold">
                            <span>Att betala nu</span>
                            <span
                                className="text-lg text-primary"
                                data-testid="price-total"
                            >
                                {total} kr
                            </span>
                        </div>
                        {priceInfo.membership > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Sedan {priceInfo.membership} kr / år automatiskt via Stripe.
                            </p>
                        )}
                    </div>

                    <label className="flex items-start gap-3 pt-2">
                        <Checkbox
                            checked={form.accept}
                            onCheckedChange={(v) =>
                                setForm({ ...form, accept: !!v })
                            }
                            data-testid="checkbox-accept"
                        />
                        <span className="text-sm text-muted-foreground">
                            Jag accepterar registreringsvillkor och att uppgifterna
                            lagras enligt GDPR. Registreringsavgift 300 kr,
                            årsavgift 100 kr.
                        </span>
                    </label>
                    <Button
                        type="submit"
                        className="w-full h-11"
                        disabled={busy}
                        data-testid="button-submit-register-bird"
                    >
                        {busy ? "Öppnar kassan…" : "Registrera & gå till kassan"}
                    </Button>
                </form>
            </div>
            <PublicFooter />

            {/* Success dialog with account + payment plan info */}
            <Dialog
                open={!!successData}
                onOpenChange={(v) => {
                    if (!v) {
                        setSuccessData(null);
                        navigate(user ? "/mina-faglar" : "/galleri");
                    }
                }}
            >
                <DialogContent className="max-w-md" data-testid="dialog-register-success">
                    <div className="text-center pt-2">
                        <div className="w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={32} weight="duotone" className="text-[hsl(var(--success))]" />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-center">
                                Fågeln är registrerad!
                            </DialogTitle>
                            <DialogDescription className="text-center pt-2">
                                Ringnummer <span className="font-mono font-semibold">{successData?.bird?.ring_number}</span> är nu i registret.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {successData?.account_created && successData?.temp_password && (
                        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <Key size={16} weight="duotone" className="text-primary" />
                                <p className="text-sm font-semibold">Ditt konto är skapat</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Spara dessa uppgifter — du behöver dem för att logga in och hantera din fågel.
                            </p>
                            <div className="text-sm space-y-1 font-mono bg-card p-3 rounded border border-border">
                                <div>
                                    <span className="text-muted-foreground">E-post:</span> {successData.account_email}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Lösenord:</span>{" "}
                                    <span data-testid="temp-password">{successData.temp_password}</span>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Du kan byta lösenordet efter första inloggningen.
                            </p>
                        </div>
                    )}

                    {successData?.payment_plan && (
                        <div className="mt-4 rounded-md border border-border bg-card p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldCheck size={16} weight="duotone" className="text-primary" />
                                <p className="text-sm font-semibold">Årlig betalningsplan</p>
                            </div>
                            <dl className="text-xs space-y-1">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Registreringsavgift</dt>
                                    <dd className="font-medium">
                                        {successData.payment_plan.registration_amount} kr
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Årsavgift</dt>
                                    <dd className="font-medium">
                                        {successData.payment_plan.annual_amount} kr / år
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Nästa förfallodag</dt>
                                    <dd className="font-medium" data-testid="next-due-date">
                                        {successData.payment_plan.next_due_date}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    )}

                    <DialogFooter className="mt-4">
                        <Button
                            className="w-full"
                            onClick={() => {
                                setSuccessData(null);
                                navigate(successData?.account_created ? "/login" : (user ? "/mina-faglar" : "/galleri"));
                            }}
                            data-testid="button-close-register-success"
                        >
                            {successData?.account_created ? "Logga in" : "Fortsätt"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
