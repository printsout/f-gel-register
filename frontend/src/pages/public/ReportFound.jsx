import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MapPin } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ReportFound() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        description: "",
        location: "",
        date_found: new Date().toISOString().slice(0, 10),
        ring_number: "",
        finder_name: "",
        finder_phone: "",
    });

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post("/found-birds", form);
            toast.success("Tack! Fyndrapporten är skickad.");
            setTimeout(() => navigate("/hittade-faglar"), 1200);
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
                    <span className="label-caps">Rapportera hittad fågel</span>
                </div>
            </header>
            <div className="max-w-2xl mx-auto px-6 py-10">
                <div className="mb-8 flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-md flex items-center justify-center"
                        style={{ background: "hsl(var(--primary) / 0.12)" }}
                    >
                        <MapPin size={24} weight="duotone" className="text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-display font-bold">
                            Rapportera en hittad papegoja
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Fri rapport – inget konto krävs.
                        </p>
                    </div>
                </div>
                <form onSubmit={submit} className="surface p-6 space-y-4 fade-in">
                    <div>
                        <Label htmlFor="d">Beskrivning *</Label>
                        <Textarea
                            id="d"
                            rows={3}
                            required
                            data-testid="input-description"
                            value={form.description}
                            onChange={(e) =>
                                setForm({ ...form, description: e.target.value })
                            }
                            placeholder="Färg, storlek, ovanliga kännetecken…"
                        />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="l">Plats *</Label>
                            <Input
                                id="l"
                                required
                                data-testid="input-location"
                                value={form.location}
                                onChange={(e) =>
                                    setForm({ ...form, location: e.target.value })
                                }
                                placeholder="Ex. Slottsparken, Malmö"
                            />
                        </div>
                        <div>
                            <Label htmlFor="df">Datum *</Label>
                            <Input
                                id="df"
                                type="date"
                                required
                                data-testid="input-date-found"
                                value={form.date_found}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        date_found: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="rn">Ringnummer (om synligt)</Label>
                        <Input
                            id="rn"
                            data-testid="input-ring-number"
                            value={form.ring_number}
                            onChange={(e) =>
                                setForm({ ...form, ring_number: e.target.value })
                            }
                        />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="fn">Ditt namn *</Label>
                            <Input
                                id="fn"
                                required
                                data-testid="input-finder-name"
                                value={form.finder_name}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        finder_name: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div>
                            <Label htmlFor="fp">Telefon *</Label>
                            <Input
                                id="fp"
                                required
                                type="tel"
                                data-testid="input-finder-phone"
                                placeholder="0701234567"
                                value={form.finder_phone}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        finder_phone: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                    <Button
                        type="submit"
                        className="w-full h-11"
                        disabled={busy}
                        data-testid="button-submit-found"
                    >
                        {busy ? "Skickar…" : "Skicka rapport"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
