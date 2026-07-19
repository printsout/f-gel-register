import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, EnvelopeSimple, Phone } from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PublicFooter from "@/components/PublicFooter";
import BackHeader from "@/components/BackHeader";

export default function Contact() {
    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        subject: "",
        message: "",
        website: "", // honeypot – always empty for real users
    });
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = { ...form };
            if (!payload.phone) delete payload.phone;
            await api.post("/contact", payload);
            setSent(true);
            toast.success("Tack! Vi återkommer så snart vi kan.");
            setForm({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <BackHeader label="Kontakta oss" />
            <div className="max-w-3xl mx-auto px-6 py-10">
                <div className="mb-8">
                    <p className="label-caps mb-2">Kontakt</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Hör av dig
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Har du en fråga om registrering, hittad fågel eller något annat?
                        Fyll i formuläret så återkommer vi.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="surface p-5 flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: "hsl(var(--primary) / 0.12)" }}
                        >
                            <EnvelopeSimple size={22} weight="duotone" className="text-primary" />
                        </div>
                        <div className="min-w-0">
                            <p className="label-caps text-xs">E-post</p>
                            <a
                                href="mailto:info@fagelregister.se"
                                className="text-sm hover:underline break-all"
                                data-testid="contact-email-link"
                            >
                                info@fagelregister.se
                            </a>
                        </div>
                    </div>
                    <div className="surface p-5 flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: "hsl(var(--primary) / 0.12)" }}
                        >
                            <Phone size={22} weight="duotone" className="text-primary" />
                        </div>
                        <div className="min-w-0">
                            <p className="label-caps text-xs">Telefon</p>
                            <a
                                href="tel:0768488091"
                                className="text-sm hover:underline"
                                data-testid="contact-phone-link"
                            >
                                0768 48 80 91
                            </a>
                        </div>
                    </div>
                    <div className="surface p-5 flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: "hsl(var(--muted))" }}
                        >
                            <CheckCircle
                                size={22}
                                weight="duotone"
                                className="text-muted-foreground"
                            />
                        </div>
                        <div className="min-w-0">
                            <p className="label-caps text-xs">Svarstid</p>
                            <p className="text-sm">1–2 vardagar</p>
                        </div>
                    </div>
                </div>

                {sent ? (
                    <div
                        className="surface p-8 text-center space-y-3"
                        data-testid="contact-sent"
                    >
                        <div className="w-14 h-14 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto">
                            <CheckCircle
                                size={30}
                                weight="duotone"
                                className="text-[hsl(var(--success))]"
                            />
                        </div>
                        <h2 className="text-xl font-display font-bold">
                            Tack för ditt meddelande!
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Vi återkommer via e-post inom 1–2 vardagar.
                        </p>
                        <div className="pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setSent(false)}
                                data-testid="button-send-another"
                            >
                                Skicka ett till meddelande
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form
                        onSubmit={submit}
                        className="surface p-6 space-y-5 fade-in"
                        data-testid="contact-form"
                    >
                        {/* Honeypot – hidden from users, catches bots */}
                        <div
                            aria-hidden="true"
                            style={{
                                position: "absolute",
                                left: "-10000px",
                                top: "auto",
                                width: "1px",
                                height: "1px",
                                overflow: "hidden",
                            }}
                        >
                            <label htmlFor="website">Webbplats (lämna tomt)</label>
                            <input
                                id="website"
                                name="website"
                                type="text"
                                tabIndex={-1}
                                autoComplete="off"
                                value={form.website}
                                onChange={(e) =>
                                    setForm({ ...form, website: e.target.value })
                                }
                            />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="name">Namn *</Label>
                                <Input
                                    id="name"
                                    required
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm({ ...form, name: e.target.value })
                                    }
                                    data-testid="contact-input-name"
                                />
                            </div>
                            <div>
                                <Label htmlFor="email">E-post *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    value={form.email}
                                    onChange={(e) =>
                                        setForm({ ...form, email: e.target.value })
                                    }
                                    data-testid="contact-input-email"
                                />
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="phone">Telefon (valfritt)</Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="0701234567"
                                    value={form.phone}
                                    onChange={(e) =>
                                        setForm({ ...form, phone: e.target.value })
                                    }
                                    data-testid="contact-input-phone"
                                />
                            </div>
                            <div>
                                <Label htmlFor="subject">Ämne *</Label>
                                <Input
                                    id="subject"
                                    required
                                    value={form.subject}
                                    onChange={(e) =>
                                        setForm({ ...form, subject: e.target.value })
                                    }
                                    placeholder="T.ex. Fråga om registrering"
                                    data-testid="contact-input-subject"
                                />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="message">Meddelande *</Label>
                            <Textarea
                                id="message"
                                required
                                rows={6}
                                value={form.message}
                                onChange={(e) =>
                                    setForm({ ...form, message: e.target.value })
                                }
                                placeholder="Berätta hur vi kan hjälpa dig…"
                                data-testid="contact-input-message"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full h-11"
                            disabled={busy}
                            data-testid="contact-submit"
                        >
                            {busy ? "Skickar…" : "Skicka meddelande"}
                        </Button>
                    </form>
                )}
            </div>
            <PublicFooter />
        </div>
    );
}
