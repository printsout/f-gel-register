import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TextT, FloppyDisk, Plus } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { useSiteTexts } from "@/context/SiteTextsContext";
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

// Registry of known text keys, grouped by page. Every key that useSiteText()
// consumes in the frontend MUST have a fallback here so admins can override it.
const GROUPS = [
    {
        label: "Global – header & footer",
        items: [
            { key: "site.title", label: "Sidans titel (browser)", fallback: "Fågelregister" },
            { key: "header.tagline", label: "Slogan i header", fallback: "Sveriges fågelregister" },
            { key: "header.nav.my_pages", label: "Header – knapp \"Mina sidor\"", fallback: "Mina sidor" },
            { key: "header.nav.admin", label: "Header – knapp \"Admin\"", fallback: "Admin" },
            { key: "header.nav.login", label: "Header – knapp \"Logga in\"", fallback: "Logga in" },
            { key: "footer.copyright", label: "Footer – copyright", fallback: "© Fågelregister" },
            { key: "footer.contact_cta", label: "Footer – kontaktknapp", fallback: "Kontakta oss" },
        ],
    },
    {
        label: "Startsida (fallback när inga sektioner konfigurerats)",
        items: [
            { key: "landing.fallback.eyebrow", label: "Startsida fallback – överrubrik", fallback: "Startsida" },
            { key: "landing.fallback.title", label: "Startsida fallback – rubrik", fallback: "Välkommen till Fågelregister" },
            { key: "landing.fallback.body", label: "Startsida fallback – brödtext", fallback: "Startsidan konfigureras av admin. Kika förbi galleriet i mellantiden." },
        ],
    },
    {
        label: "Inloggning / skapa konto",
        items: [
            { key: "login.eyebrow", label: "Login – överrubrik", fallback: "Adminportal" },
            { key: "login.title", label: "Login – rubrik", fallback: "Välkommen tillbaka" },
            { key: "login.subtitle", label: "Login – undertext", fallback: "Logga in för att hantera registret." },
            { key: "login.register_title", label: "Skapa konto – rubrik", fallback: "Skapa konto" },
            { key: "login.register_subtitle", label: "Skapa konto – undertext", fallback: "Fyll i dina uppgifter för att komma igång." },
            { key: "login.google_button", label: "Google-knapp", fallback: "Fortsätt med Google" },
            { key: "login.divider", label: "Avdelare mellan knappar", fallback: "eller" },
            { key: "login.forgot_password", label: "Länk – glömt lösenord", fallback: "Glömt lösenord?" },
            { key: "login.submit_login", label: "Knapp – logga in", fallback: "Logga in" },
            { key: "login.submit_register", label: "Knapp – skapa konto", fallback: "Skapa konto" },
            { key: "login.hero.eyebrow", label: "Höger sida – överrubrik", fallback: "Sveriges papegojregister" },
            { key: "login.hero.title", label: "Höger sida – rubrik", fallback: "Håll registret levande — och våra fåglar säkra." },
            { key: "login.hero.subtitle", label: "Höger sida – undertext", fallback: "Från ringnummer till återförening. Ett verktyg för ägare och volontärer runt om i landet." },
        ],
    },
    {
        label: "Kontakt",
        items: [
            { key: "contact.eyebrow", label: "Kontakt – överrubrik", fallback: "Kontakt" },
            { key: "contact.title", label: "Kontakt – rubrik", fallback: "Hör av dig" },
            { key: "contact.subtitle", label: "Kontakt – undertext", fallback: "Har du en fråga om registrering, hittad fågel eller något annat? Fyll i formuläret så återkommer vi." },
            { key: "contact.email_value", label: "Kontakt – e-postadress", fallback: "info@fagelregister.se" },
            { key: "contact.phone_value", label: "Kontakt – telefon", fallback: "0768 48 80 91" },
            { key: "contact.response_time", label: "Kontakt – svarstid", fallback: "1–2 vardagar" },
        ],
    },
    {
        label: "Registrera fågel",
        items: [
            { key: "register.title", label: "Registrera – rubrik", fallback: "Registrera din papegoja" },
            { key: "register.subtitle", label: "Registrera – undertext", fallback: "Fyll i uppgifter så din fågel finns i registret." },
            { key: "register.submit_button", label: "Registrera – knapp", fallback: "Registrera & gå till kassan" },
            { key: "register.terms_text", label: "Registrera – villkorstext", fallback: "Jag accepterar registreringsvillkor och att uppgifterna lagras enligt GDPR." },
        ],
    },
    {
        label: "Rapportera hittad / saknad",
        items: [
            { key: "report_found.title", label: "Rapportera hittad – rubrik", fallback: "Rapportera en hittad papegoja" },
            { key: "report_found.subtitle", label: "Rapportera hittad – undertext", fallback: "Fri rapport – inget konto krävs." },
            { key: "report_missing.title", label: "Rapportera saknad – rubrik", fallback: "Min papegoja har flugit iväg" },
            { key: "report_missing.subtitle", label: "Rapportera saknad – undertext", fallback: "Rapportera din bortflögna fågel. Uppgifterna är privata och syns endast för admin — de kontaktar dig så fort fågeln hittas." },
            { key: "report_missing.privacy_notice", label: "Rapportera saknad – integritetsnotis", fallback: "Denna rapport visas inte i galleriet eller på hittade-fåglar-sidan. Endast Fågelregisters administratörer ser dina uppgifter och kontaktar dig när något matchar." },
        ],
    },
    {
        label: "Hittade fåglar (lista)",
        items: [
            { key: "found_list.title", label: "Hittade – rubrik", fallback: "Hittade papegojor" },
            { key: "found_list.subtitle", label: "Hittade – undertext", fallback: "Rapporter från allmänheten. Har du sett din fågel? Ring upphittaren direkt." },
            { key: "found_list.empty_state", label: "Hittade – tomt läge", fallback: "Inga rapporter hittades." },
        ],
    },
    {
        label: "Ägarbyte",
        items: [
            { key: "transfer.title", label: "Ägarbyte – rubrik", fallback: "Ägarbyte" },
            { key: "transfer.subtitle", label: "Ägarbyte – undertext", fallback: "Fyll i uppgifter för både dig och den nya ägaren. Vi granskar begäran och kontaktar dig vid eventuella frågor." },
            { key: "transfer.info_note", label: "Ägarbyte – informationsruta", fallback: "Ägarbyte är gratis. Den nya ägaren ska betala medlemsavgiften inom 14 dagar efter att bytet godkänts. Vi återkommer via e-post när bytet är hanterat." },
        ],
    },
    {
        label: "Mina sidor",
        items: [
            { key: "mybirds.eyebrow", label: "Mina sidor – överrubrik", fallback: "Din community-profil" },
            { key: "mybirds.title", label: "Mina sidor – rubrik", fallback: "Mina sidor" },
        ],
    },
    {
        label: "Admin",
        items: [
            { key: "admin.dashboard.title", label: "Admin – Översikt-rubrik", fallback: "Översikt" },
            { key: "admin.sidebar.title", label: "Admin – sidomeny-rubrik", fallback: "Admin" },
        ],
    },
];

// Flat list of all keys for quick lookup
const ALL_KEYS = GROUPS.flatMap((g) => g.items);

export default function SiteTexts() {
    const { refresh } = useSiteTexts();
    const [values, setValues] = useState({});
    const [saving, setSaving] = useState({});
    const [customKey, setCustomKey] = useState("");
    const [customValue, setCustomValue] = useState("");
    const [customItems, setCustomItems] = useState([]);

    const load = async () => {
        try {
            const { data } = await api.get("/admin/site-texts");
            const map = {};
            data.forEach((d) => (map[d.key] = d.value));
            setValues(map);
            // Any DB key not in ALL_KEYS is a "custom" entry admins added earlier
            const known = new Set(ALL_KEYS.map((k) => k.key));
            const extras = data
                .map((d) => d.key)
                .filter((k) => !known.has(k));
            setCustomItems(extras);
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
            // Refresh the global site-texts context so live site updates immediately
            refresh();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSaving((s) => ({ ...s, [key]: false }));
        }
    };

    const addCustom = async () => {
        const trimmedKey = customKey.trim();
        if (!trimmedKey || !customValue.trim()) return;
        await save(trimmedKey, customValue);
        setValues((v) => ({ ...v, [trimmedKey]: customValue }));
        setCustomItems((prev) => (prev.includes(trimmedKey) ? prev : [...prev, trimmedKey]));
        setCustomKey("");
        setCustomValue("");
    };

    const renderRow = (item) => {
        const val = values[item.key] ?? "";
        return (
            <TableRow key={item.key}>
                <TableCell>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                        {item.key}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        Standard: {item.fallback}
                    </div>
                </TableCell>
                <TableCell>
                    <Input
                        value={val}
                        placeholder={item.fallback}
                        onChange={(e) =>
                            setValues((v) => ({
                                ...v,
                                [item.key]: e.target.value,
                            }))
                        }
                        data-testid={`input-text-${item.key}`}
                    />
                </TableCell>
                <TableCell className="text-right">
                    <Button
                        size="sm"
                        onClick={() => save(item.key, val)}
                        disabled={saving[item.key]}
                        data-testid={`btn-save-text-${item.key}`}
                    >
                        <FloppyDisk size={14} className="mr-1.5" />
                        {saving[item.key] ? "Sparar…" : "Spara"}
                    </Button>
                </TableCell>
            </TableRow>
        );
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
                    återgå till standardtexten. Ändringar syns direkt vid nästa sidladdning.
                </p>
            </div>

            {GROUPS.map((group) => (
                <div key={group.label} className="surface overflow-hidden mb-6">
                    <div className="px-6 py-3 border-b border-border bg-muted/40">
                        <p className="label-caps text-xs">{group.label}</p>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-2/5">Var</TableHead>
                                <TableHead>Text</TableHead>
                                <TableHead className="w-32 text-right">Åtgärd</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {group.items.map((item) => renderRow(item))}
                        </TableBody>
                    </Table>
                </div>
            ))}

            {customItems.length > 0 && (
                <div className="surface overflow-hidden mb-6">
                    <div className="px-6 py-3 border-b border-border bg-muted/40">
                        <p className="label-caps text-xs">Anpassade texter</p>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-2/5">Nyckel</TableHead>
                                <TableHead>Text</TableHead>
                                <TableHead className="w-32 text-right">Åtgärd</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customItems.map((key) =>
                                renderRow({ key, label: key, fallback: "(anpassad)" }),
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

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
