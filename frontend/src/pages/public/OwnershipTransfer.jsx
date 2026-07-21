import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowsClockwise, CheckCircle } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import PublicFooter from "@/components/PublicFooter";
import BackHeader from "@/components/BackHeader";

const EMPTY = {
    bird_id: "",
    from_owner_name: "",
    from_owner_email: "",
    from_owner_phone: "",
    from_owner_address: "",
    to_owner_name: "",
    to_owner_email: "",
    to_owner_phone: "",
    to_owner_address: "",
    note: "",
};

export default function OwnershipTransfer() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [birds, setBirds] = useState([]);
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (user === null) return; // still loading auth context
        if (!user) {
            navigate("/login?redirect=/agarbyte");
            return;
        }
        api.get("/my-birds")
            .then(({ data }) => {
                const paid = data.filter((b) => b.payment_status === "completed");
                setBirds(paid);
            })
            .catch((e) => toast.error(formatApiError(e)));
    }, [user, navigate]);

    useEffect(() => {
        if (user) {
            setForm((f) => ({
                ...f,
                from_owner_email: f.from_owner_email || user.email || "",
                from_owner_name:
                    f.from_owner_name ||
                    [user.first_name, user.last_name].filter(Boolean).join(" "),
            }));
        }
    }, [user]);

    const patch = (obj) => setForm((f) => ({ ...f, ...obj }));

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post("/ownership-transfers", form);
            setSubmitted(true);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    if (submitted) {
        return (
            <>
                <BackHeader title="Ägarbyte" />
                <main className="min-h-[70vh] max-w-2xl mx-auto px-6 py-16" data-testid="transfer-success">
                    <div className="surface p-8 text-center space-y-4">
                        <CheckCircle
                            size={56}
                            weight="duotone"
                            className="text-[hsl(var(--success))] mx-auto"
                        />
                        <h1 className="font-display text-3xl font-bold">
                            Ägarbytet har skickats
                        </h1>
                        <p className="text-muted-foreground">
                            Vi granskar din begäran och återkommer via e-post. Både du och den nya
                            ägaren får bekräftelse när bytet är klart.
                        </p>
                        <div className="pt-2 flex justify-center gap-3">
                            <Link to="/mina-faglar">
                                <Button variant="outline">Mina fåglar</Button>
                            </Link>
                            <Link to="/">
                                <Button>Till startsidan</Button>
                            </Link>
                        </div>
                    </div>
                </main>
                <PublicFooter />
            </>
        );
    }

    return (
        <>
            <BackHeader title="Ägarbyte" />
            <main className="min-h-screen max-w-2xl mx-auto px-6 py-10">
                <div className="mb-8 flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ArrowsClockwise size={28} weight="duotone" className="text-primary" />
                    </div>
                    <div>
                        <h1 className="font-display text-3xl md:text-4xl font-bold">
                            Ägarbyte
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Fyll i uppgifter för både dig och den nya ägaren. Vi granskar
                            begäran och kontaktar dig vid eventuella frågor.
                        </p>
                    </div>
                </div>

                {birds.length === 0 ? (
                    <div className="surface p-6 text-center space-y-3">
                        <p className="text-muted-foreground">
                            Du har inga betalda fåglar som kan överlåtas.
                        </p>
                        <Link to="/registrera-fagel">
                            <Button variant="outline">Registrera en fågel först</Button>
                        </Link>
                    </div>
                ) : (
                    <form
                        onSubmit={submit}
                        className="surface p-6 space-y-8"
                        data-testid="transfer-form"
                    >
                        <div>
                            <Label htmlFor="bird">Välj fågel *</Label>
                            <Select
                                value={form.bird_id}
                                onValueChange={(v) => patch({ bird_id: v })}
                            >
                                <SelectTrigger
                                    id="bird"
                                    className="mt-1"
                                    data-testid="select-transfer-bird"
                                >
                                    <SelectValue placeholder="Välj bland dina fåglar…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {birds.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            {b.species} — {b.ring_number}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Current owner */}
                        <section className="space-y-4">
                            <div className="border-l-4 border-primary pl-4">
                                <p className="label-caps text-primary">Nuvarande ägare</p>
                                <p className="text-sm text-muted-foreground">
                                    Dina uppgifter — bekräfta att de stämmer.
                                </p>
                            </div>
                            <FieldGrid>
                                <FieldInput
                                    label="Namn *"
                                    value={form.from_owner_name}
                                    onChange={(v) => patch({ from_owner_name: v })}
                                    testid="input-from-name"
                                    required
                                />
                                <FieldInput
                                    label="E-post *"
                                    type="email"
                                    value={form.from_owner_email}
                                    onChange={(v) => patch({ from_owner_email: v })}
                                    testid="input-from-email"
                                    required
                                />
                                <FieldInput
                                    label="Telefon *"
                                    type="tel"
                                    value={form.from_owner_phone}
                                    onChange={(v) => patch({ from_owner_phone: v })}
                                    testid="input-from-phone"
                                    required
                                />
                                <FieldInput
                                    label="Adress *"
                                    value={form.from_owner_address}
                                    onChange={(v) => patch({ from_owner_address: v })}
                                    testid="input-from-address"
                                    required
                                />
                            </FieldGrid>
                        </section>

                        {/* New owner */}
                        <section className="space-y-4">
                            <div className="border-l-4 border-[hsl(var(--success))] pl-4">
                                <p className="label-caps text-[hsl(var(--success))]">
                                    Ny ägare
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Uppgifter till den som tar över fågeln. Vi skapar konto
                                    automatiskt om det inte redan finns.
                                </p>
                            </div>
                            <FieldGrid>
                                <FieldInput
                                    label="Namn *"
                                    value={form.to_owner_name}
                                    onChange={(v) => patch({ to_owner_name: v })}
                                    testid="input-to-name"
                                    required
                                />
                                <FieldInput
                                    label="E-post *"
                                    type="email"
                                    value={form.to_owner_email}
                                    onChange={(v) => patch({ to_owner_email: v })}
                                    testid="input-to-email"
                                    required
                                />
                                <FieldInput
                                    label="Telefon *"
                                    type="tel"
                                    value={form.to_owner_phone}
                                    onChange={(v) => patch({ to_owner_phone: v })}
                                    testid="input-to-phone"
                                    required
                                />
                                <FieldInput
                                    label="Adress *"
                                    value={form.to_owner_address}
                                    onChange={(v) => patch({ to_owner_address: v })}
                                    testid="input-to-address"
                                    required
                                />
                            </FieldGrid>
                        </section>

                        <div>
                            <Label htmlFor="note">Meddelande till admin (valfritt)</Label>
                            <Textarea
                                id="note"
                                rows={3}
                                placeholder="T.ex. datum för överlåtelse, orsak eller annan info."
                                value={form.note}
                                onChange={(e) => patch({ note: e.target.value })}
                                data-testid="input-transfer-note"
                            />
                        </div>

                        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                            <p className="mb-1 font-semibold text-foreground">Att veta</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Ägarbyte är gratis.</li>
                                <li>
                                    Den nya ägaren ska betala medlemsavgiften (100 kr) inom
                                    <strong> 14 dagar </strong>efter att bytet godkänts.
                                </li>
                                <li>Vi återkommer via e-post när bytet är hanterat.</li>
                            </ul>
                        </div>

                        <div className="flex justify-end gap-3">
                            <Link to="/mina-faglar">
                                <Button type="button" variant="outline">
                                    <ArrowLeft size={16} className="mr-2" /> Avbryt
                                </Button>
                            </Link>
                            <Button
                                type="submit"
                                disabled={busy || !form.bird_id}
                                data-testid="button-submit-transfer"
                            >
                                {busy ? "Skickar…" : "Skicka ägarbyte"}
                            </Button>
                        </div>
                    </form>
                )}
            </main>
            <PublicFooter />
        </>
    );
}

function FieldGrid({ children }) {
    return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function FieldInput({ label, value, onChange, type = "text", testid, required }) {
    return (
        <div>
            <Label>{label}</Label>
            <Input
                type={type}
                required={required}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testid}
                className="mt-1"
            />
        </div>
    );
}
