import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
    ArrowLeft,
    WarningCircle,
    ShieldCheck,
    CheckCircle,
} from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

export default function ReportMissing() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [form, setForm] = useState({
        owner_name: "",
        contact_phone: "",
        contact_email: "",
        species: "",
        ring_number: "",
        description: "",
        last_seen_location: "",
        last_seen_date: new Date().toISOString().slice(0, 10),
        reward_offered: "",
    });

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = { ...form };
            // Strip empty optional fields
            if (!payload.contact_email) delete payload.contact_email;
            if (!payload.ring_number) delete payload.ring_number;
            if (!payload.reward_offered) delete payload.reward_offered;
            await api.post("/missing-birds", payload);
            setShowSuccess(true);
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
                    <span className="label-caps">Rapportera bortflögen fågel</span>
                </div>
            </header>
            <div className="max-w-2xl mx-auto px-6 py-10">
                <div className="mb-6 flex items-start gap-3">
                    <div
                        className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: "hsl(var(--destructive) / 0.12)" }}
                    >
                        <WarningCircle
                            size={26}
                            weight="duotone"
                            className="text-destructive"
                        />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-display font-bold">
                            Min papegoja har flugit iväg
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Rapportera din bortflögna fågel. Uppgifterna är
                            <strong> privata</strong> och syns endast för admin — de
                            kontaktar dig så fort fågeln hittas.
                        </p>
                    </div>
                </div>

                <div
                    className="rounded-md bg-primary/5 border border-primary/20 p-4 mb-6 flex items-start gap-3"
                    data-testid="privacy-notice"
                >
                    <ShieldCheck
                        size={20}
                        weight="duotone"
                        className="text-primary flex-shrink-0 mt-0.5"
                    />
                    <p className="text-xs text-muted-foreground">
                        Denna rapport visas <strong>inte</strong> i galleriet eller på
                        hittade-fåglar-sidan. Endast Papegojregistrets administratörer
                        ser dina uppgifter och kontaktar dig när något matchar.
                    </p>
                </div>

                <form onSubmit={submit} className="surface p-6 space-y-4 fade-in">
                    <div>
                        <Label htmlFor="owner">Ditt namn *</Label>
                        <Input
                            id="owner"
                            required
                            data-testid="input-owner-name"
                            value={form.owner_name}
                            onChange={(e) =>
                                setForm({ ...form, owner_name: e.target.value })
                            }
                        />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="phone">Telefon *</Label>
                            <Input
                                id="phone"
                                required
                                type="tel"
                                placeholder="0701234567"
                                data-testid="input-contact-phone"
                                value={form.contact_phone}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        contact_phone: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div>
                            <Label htmlFor="email">E-post (valfritt)</Label>
                            <Input
                                id="email"
                                type="email"
                                data-testid="input-contact-email"
                                value={form.contact_email}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        contact_email: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="sp">Fågelart *</Label>
                            <Input
                                id="sp"
                                required
                                placeholder="Ex. Ara – Blå och gul"
                                data-testid="input-species"
                                value={form.species}
                                onChange={(e) =>
                                    setForm({ ...form, species: e.target.value })
                                }
                            />
                        </div>
                        <div>
                            <Label htmlFor="rn">Ringnummer (om finns)</Label>
                            <Input
                                id="rn"
                                placeholder="t.ex. SE123456"
                                data-testid="input-ring-number"
                                value={form.ring_number}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        ring_number: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="desc">Beskrivning *</Label>
                        <Textarea
                            id="desc"
                            rows={3}
                            required
                            data-testid="input-description"
                            placeholder="Färg, storlek, kännetecken, personlighet…"
                            value={form.description}
                            onChange={(e) =>
                                setForm({ ...form, description: e.target.value })
                            }
                        />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="loc">Senast sedd (plats) *</Label>
                            <Input
                                id="loc"
                                required
                                placeholder="Ex. Södermalm, Stockholm"
                                data-testid="input-last-seen-location"
                                value={form.last_seen_location}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        last_seen_location: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div>
                            <Label htmlFor="date">Datum *</Label>
                            <Input
                                id="date"
                                type="date"
                                required
                                data-testid="input-last-seen-date"
                                value={form.last_seen_date}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        last_seen_date: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="rew">Hittelön (valfritt)</Label>
                        <Input
                            id="rew"
                            placeholder="Ex. 1000 kr"
                            data-testid="input-reward"
                            value={form.reward_offered}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    reward_offered: e.target.value,
                                })
                            }
                        />
                    </div>
                    <Button
                        type="submit"
                        className="w-full h-11 bg-destructive hover:bg-destructive/90"
                        disabled={busy}
                        data-testid="button-submit-missing"
                    >
                        {busy ? "Skickar…" : "Skicka rapport"}
                    </Button>
                </form>
            </div>

            {/* Success popup */}
            <Dialog open={showSuccess} onOpenChange={(v) => {
                setShowSuccess(v);
                if (!v) navigate("/");
            }}>
                <DialogContent className="max-w-md" data-testid="dialog-missing-success">
                    <div className="text-center py-4">
                        <div className="w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle
                                size={32}
                                weight="duotone"
                                className="text-[hsl(var(--success))]"
                            />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-center">
                                Rapporten är skickad
                            </DialogTitle>
                            <DialogDescription className="text-center pt-2 space-y-2">
                                <span className="block">
                                    Vi har tagit emot din rapport. Uppgifterna
                                    delas inte publikt.
                                </span>
                                <span className="block">
                                    Papegojregistrets admin bevakar inkommande
                                    fyndrapporter — så fort något matchar din
                                    fågel kontaktar vi dig via telefon eller e-post.
                                </span>
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <DialogFooter>
                        <Button
                            className="w-full"
                            onClick={() => {
                                setShowSuccess(false);
                                navigate("/");
                            }}
                            data-testid="button-close-missing-success"
                        >
                            Till startsidan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
