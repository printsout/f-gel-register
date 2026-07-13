import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Bird } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const SPECIES = [
    "Ara – Blå och gul",
    "Ara – Grönvingad",
    "Ara – Hyacint",
    "Ara – Röd (Scarlet)",
    "Amazone – Blåpannad",
    "Amazone – Dubbelgul",
    "Grå papegoja – Kongo",
    "Grå papegoja – Timneh",
    "Kakadu – Alba",
    "Kakadu – Molukk",
    "Kakadu – Galah (Rosa)",
    "Conure – Sol",
    "Conure – Grönkindad",
    "Lovebird – Fischer",
    "Eclectus",
    "Cockatiel (Korella)",
    "Undulat",
    "Senegal papegoja",
    "Quaker papegoja (Monk)",
    "Indian Ringneck",
    "Alexandrine papegoja",
    "Annat",
];

export default function RegisterBird() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        species: "",
        ring_number: "",
        owner_name: "",
        phone_number: "",
        additional_info: "",
        discount_code: "",
        accept: false,
    });

    const submit = async (e) => {
        e.preventDefault();
        if (!form.accept) {
            toast.error("Du måste acceptera villkoren.");
            return;
        }
        setBusy(true);
        try {
            const { accept, ...payload } = form;
            await api.post("/registered-birds", payload);
            const dest = user ? "/mina-faglar" : "/galleri";
            toast.success(
                user
                    ? "Fågel registrerad! Ladda upp bilder till din fågel."
                    : "Fågel registrerad! Se den i galleriet.",
            );
            setTimeout(() => navigate(dest), 1200);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                        data-testid="link-back-home"
                    >
                        <ArrowLeft size={16} />
                        Tillbaka
                    </Link>
                    <span className="label-caps">Registrera fågel</span>
                </div>
            </header>
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
                        <Select
                            value={form.species}
                            onValueChange={(v) => setForm({ ...form, species: v })}
                        >
                            <SelectTrigger
                                id="species"
                                data-testid="select-species"
                                className="mt-1"
                            >
                                <SelectValue placeholder="Välj art" />
                            </SelectTrigger>
                            <SelectContent>
                                {SPECIES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                                setForm({ ...form, ring_number: e.target.value })
                            }
                        />
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
                        {busy ? "Registrerar…" : "Registrera fågel"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
