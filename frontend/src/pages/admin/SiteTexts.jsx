import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TextT, FloppyDisk, Plus } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

// Registry of known text keys (grows as we wire more headings)
const KNOWN_KEYS = [
    { key: "site.title", label: "Sidans titel (browser)", fallback: "Fågelregister" },
    { key: "header.tagline", label: "Slogan i header", fallback: "Sveriges fågelregister" },
    { key: "landing.hero.title", label: "Startsida — Huvudrubrik", fallback: "Välkommen till Fågelregister" },
    { key: "landing.hero.subtitle", label: "Startsida — Undertext", fallback: "Registrera din fågel och skydda den vid förlust" },
    { key: "landing.hero.cta", label: "Startsida — CTA-knapp", fallback: "Registrera fågel" },
    { key: "register.title", label: "Registrera fågel — Rubrik", fallback: "Registrera fågel" },
    { key: "register.subtitle", label: "Registrera fågel — Undertext", fallback: "Fyll i uppgifterna nedan" },
    { key: "mybirds.title", label: "Mina sidor — Rubrik", fallback: "Mina sidor" },
    { key: "mybirds.subtitle", label: "Mina sidor — Undertext", fallback: "Din community-profil" },
    { key: "login.title", label: "Inloggning — Rubrik", fallback: "Välkommen tillbaka" },
    { key: "register_account.title", label: "Skapa konto — Rubrik", fallback: "Skapa konto" },
    { key: "contact.title", label: "Kontakt — Rubrik", fallback: "Kontakta oss" },
    { key: "found.title", label: "Hittade fåglar — Rubrik", fallback: "Hittade fåglar" },
    { key: "missing.title", label: "Saknade fåglar — Rubrik", fallback: "Saknade fåglar" },
    { key: "transfer.title", label: "Ägarbyte — Rubrik", fallback: "Ägarbyte" },
    { key: "admin.dashboard.title", label: "Admin — Översikt-rubrik", fallback: "Översikt" },
    { key: "admin.sidebar.title", label: "Admin — Sidomeny-rubrik", fallback: "Admin" },
    { key: "footer.copyright", label: "Footer — Copyright-text", fallback: "© Fågelregister" },
];

export default function SiteTexts() {
    const [values, setValues] = useState({});
    const [saving, setSaving] = useState({});
    const [customKey, setCustomKey] = useState("");
    const [customValue, setCustomValue] = useState("");

    const load = async () => {
        try {
            const { data } = await api.get("/admin/site-texts");
            const map = {};
            data.forEach((d) => (map[d.key] = d.value));
            setValues(map);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
    }, []);

    const save = async (key, val) => {
        setSaving((s) => ({ ...s, [key]: true }));
        try {
            await api.patch(`/admin/site-texts/${encodeURIComponent(key)}`, { value: val });
            toast.success("Sparat.");
            // Bust the public text cache so live site updates
            try {
                localStorage.removeItem("site_texts_cache");
            } catch (_) { /* ignore */ }
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSaving((s) => ({ ...s, [key]: false }));
        }
    };

    const addCustom = async () => {
        if (!customKey.trim() || !customValue.trim()) return;
        await save(customKey.trim(), customValue);
        setValues((v) => ({ ...v, [customKey.trim()]: customValue }));
        setCustomKey("");
        setCustomValue("");
    };

    return (
        <AdminLayout>
            <div className="mb-8">
                <p className="label-caps mb-2">Inställningar</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold flex items-center gap-3">
                    <TextT size={30} weight="duotone" className="text-primary" />
                    Sidtexter & rubriker
                </h1>
                <p className="text-muted-foreground mt-1">
                    Skriv över standard-rubriker och texter på hela sajten. Töm fältet för att
                    återgå till standardtexten. Ändringar syns vid nästa sidladdning.
                </p>
            </div>

            <div className="surface overflow-hidden mb-8">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-1/3">Var</TableHead>
                            <TableHead>Text</TableHead>
                            <TableHead className="w-32 text-right">Åtgärd</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {KNOWN_KEYS.map((k) => {
                            const val = values[k.key] ?? "";
                            return (
                                <TableRow key={k.key}>
                                    <TableCell>
                                        <div className="text-sm font-medium">{k.label}</div>
                                        <div className="text-xs text-muted-foreground font-mono">
                                            {k.key}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            Standard: {k.fallback}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={val}
                                            placeholder={k.fallback}
                                            onChange={(e) =>
                                                setValues((v) => ({
                                                    ...v,
                                                    [k.key]: e.target.value,
                                                }))
                                            }
                                            data-testid={`input-text-${k.key}`}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            onClick={() => save(k.key, val)}
                                            disabled={saving[k.key]}
                                            data-testid={`btn-save-text-${k.key}`}
                                        >
                                            <FloppyDisk size={14} className="mr-1.5" />
                                            {saving[k.key] ? "Sparar…" : "Spara"}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <div className="surface p-6 max-w-2xl">
                <p className="label-caps mb-3">Lägg till anpassad text</p>
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div>
                        <Label>Nyckel (kebab.case)</Label>
                        <Input
                            value={customKey}
                            placeholder="t.ex. faq.title"
                            onChange={(e) => setCustomKey(e.target.value)}
                            data-testid="input-custom-key"
                        />
                    </div>
                    <div>
                        <Label>Text</Label>
                        <Input
                            value={customValue}
                            onChange={(e) => setCustomValue(e.target.value)}
                            data-testid="input-custom-value"
                        />
                    </div>
                </div>
                <Button onClick={addCustom} data-testid="btn-add-custom-text">
                    <Plus size={14} className="mr-1.5" /> Lägg till
                </Button>
            </div>
        </AdminLayout>
    );
}
