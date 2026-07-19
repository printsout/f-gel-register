import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    Plus,
    Eye,
    EyeSlash,
    ArrowUp,
    ArrowDown,
    Copy,
    Trash,
    ArrowSquareOut,
    Layout,
    Rows,
    ChatCenteredText,
    ChartBar,
    WarningCircle,
    ImageSquare,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import BulkActionsBar, { SelectAllCheckbox } from "@/components/BulkActionsBar";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { StyleEditor, RichTextEditor } from "@/components/StyleControls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SECTION_META = {
    hero: { label: "Hero (huvudsektion)", icon: Layout },
    emergency_cta: { label: "Nöd-CTA", icon: WarningCircle },
    features: { label: "Fördelar (kort-grid)", icon: ChartBar },
    text_block: { label: "Textblock", icon: ChatCenteredText },
    cta_banner: { label: "CTA-banner", icon: ImageSquare },
};

// Convert legacy plain-text content to HTML on the fly for the rich text editor.
function escapeAsHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");
}

function SectionListItem({ section, index, total, active, onSelect, onToggleVisible, onMove, onDuplicate, onDelete, selected, onToggleSelect }) {
    const Icon = SECTION_META[section.type]?.icon || Rows;
    return (
        <div
            className={`rounded-md border transition-colors cursor-pointer ${
                active
                    ? "border-primary bg-primary/5"
                    : selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-border/80 bg-card"
            }`}
            onClick={onSelect}
            data-testid={`section-item-${section.id}`}
        >
            <div className="p-3 flex items-center gap-3">
                <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                        checked={selected}
                        onCheckedChange={onToggleSelect}
                        data-testid={`bulk-select-row-${section.id}`}
                    />
                </div>
                <span className="text-sm font-mono text-muted-foreground w-4 flex-shrink-0">
                    {index + 1}
                </span>
                <Icon
                    size={18}
                    weight="duotone"
                    className={active ? "text-primary" : "text-muted-foreground"}
                />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                        {section.label}
                        {!section.is_visible && (
                            <Badge variant="outline" className="text-[10px] bg-muted">
                                Dold
                            </Badge>
                        )}
                    </div>
                    {section.subtitle && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {section.subtitle}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onToggleVisible}
                        data-testid={`button-toggle-visible-${section.id}`}
                    >
                        {section.is_visible ? <Eye size={14} /> : <EyeSlash size={14} />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === 0}
                        onClick={() => onMove(-1)}
                        data-testid={`button-move-up-${section.id}`}
                    >
                        <ArrowUp size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === total - 1}
                        onClick={() => onMove(1)}
                        data-testid={`button-move-down-${section.id}`}
                    >
                        <ArrowDown size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onDuplicate}
                        data-testid={`button-duplicate-${section.id}`}
                    >
                        <Copy size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={onDelete}
                        data-testid={`button-delete-section-${section.id}`}
                    >
                        <Trash size={14} />
                    </Button>
                </div>
            </div>
        </div>
    );
}

function TextField({ label, value, onChange, placeholder, testid, rows }) {
    if (rows) {
        return (
            <div>
                <Label className="label-caps">{label}</Label>
                <Textarea
                    rows={rows}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    data-testid={testid}
                    className="mt-1"
                />
            </div>
        );
    }
    return (
        <div>
            <Label className="label-caps">{label}</Label>
            <Input
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                data-testid={testid}
                className="mt-1"
            />
        </div>
    );
}

function ConfigField({ section, updateConfig, patchConfig }) {
    const c = section.config || {};
    switch (section.type) {
        case "hero": {
            const disc = c.discount || {};
            const patchDiscount = (d) => patchConfig({ discount: { ...disc, ...d } });
            return (
                <div className="space-y-4">
                    <TextField label="Förrubrik (eyebrow)" value={c.eyebrow} onChange={(v) => patchConfig({ eyebrow: v })} placeholder="Personliga produkter" testid="config-eyebrow" />
                    <TextField label="Huvudrubrik" value={c.title} onChange={(v) => patchConfig({ title: v })} placeholder="Skapa unika produkter med dina bilder" testid="config-title" rows={2} />
                    <div>
                        <Label className="label-caps">Markerat ord (färgas i orange)</Label>
                        <Input value={c.highlighted_word || ""} onChange={(e) => patchConfig({ highlighted_word: e.target.value })} placeholder="dina bilder" data-testid="config-highlighted-word" className="mt-1" />
                        <p className="text-xs text-muted-foreground mt-1">Detta ord eller frasen ska finnas i huvudrubriken</p>
                    </div>
                    <TextField label="Underrubrik" value={c.body} onChange={(v) => patchConfig({ body: v })} placeholder="Kort beskrivande text…" testid="config-body" rows={3} />
                    <div className="border-t border-border pt-4 space-y-3">
                        <p className="label-caps">Knappar</p>
                        <div className="grid grid-cols-2 gap-3">
                            <TextField label="CTA-1 text" value={c.cta_primary_label} onChange={(v) => patchConfig({ cta_primary_label: v })} testid="config-cta1-label" />
                            <TextField label="CTA-1 länk" value={c.cta_primary_link} onChange={(v) => patchConfig({ cta_primary_link: v })} placeholder="/registrera-fagel" testid="config-cta1-link" />
                            <TextField label="CTA-2 text" value={c.cta_secondary_label} onChange={(v) => patchConfig({ cta_secondary_label: v })} testid="config-cta2-label" />
                            <TextField label="CTA-2 länk" value={c.cta_secondary_link} onChange={(v) => patchConfig({ cta_secondary_link: v })} testid="config-cta2-link" />
                            <TextField label="CTA-3 text" value={c.cta_tertiary_label} onChange={(v) => patchConfig({ cta_tertiary_label: v })} testid="config-cta3-label" />
                            <TextField label="CTA-3 länk" value={c.cta_tertiary_link} onChange={(v) => patchConfig({ cta_tertiary_link: v })} testid="config-cta3-link" />
                        </div>
                    </div>
                    <TextField label="Hero-bild (URL)" value={c.image_url} onChange={(v) => patchConfig({ image_url: v })} placeholder="https://…" testid="config-image-url" />

                    {/* Rabatt-bubbla */}
                    <div className="border-t border-border pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="label-caps">Rabatt-bubbla</p>
                            <label className="flex items-center gap-2 text-sm">
                                <Switch
                                    checked={!!disc.enabled}
                                    onCheckedChange={(v) => patchDiscount({ enabled: v })}
                                    data-testid="config-discount-enabled"
                                />
                                <span className="text-muted-foreground">
                                    {disc.enabled ? "Aktiv" : "Av"}
                                </span>
                            </label>
                        </div>
                        {disc.enabled && (
                            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                                <TextField
                                    label="Rubrik (kort)"
                                    value={disc.title}
                                    onChange={(v) => patchDiscount({ title: v })}
                                    placeholder="20% RABATT"
                                    testid="config-discount-title"
                                />
                                <TextField
                                    label="Underrubrik"
                                    value={disc.subtitle}
                                    onChange={(v) => patchDiscount({ subtitle: v })}
                                    placeholder="Kod: FAGEL20"
                                    testid="config-discount-subtitle"
                                />
                                <TextField
                                    label="Länk (klickmål)"
                                    value={disc.link}
                                    onChange={(v) => patchDiscount({ link: v })}
                                    placeholder="/registrera-fagel"
                                    testid="config-discount-link"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="label-caps">Bakgrund</Label>
                                        <div className="flex items-center gap-2 mt-1">
                                            <input
                                                type="color"
                                                value={disc.bg_color && disc.bg_color.startsWith("#") ? disc.bg_color : "#FF5C00"}
                                                onChange={(e) => patchDiscount({ bg_color: e.target.value })}
                                                className="h-9 w-11 rounded border border-border cursor-pointer bg-transparent"
                                                data-testid="config-discount-bg"
                                            />
                                            <Input
                                                value={disc.bg_color || ""}
                                                onChange={(e) => patchDiscount({ bg_color: e.target.value })}
                                                placeholder="#FF5C00"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="label-caps">Textfärg</Label>
                                        <div className="flex items-center gap-2 mt-1">
                                            <input
                                                type="color"
                                                value={disc.text_color && disc.text_color.startsWith("#") ? disc.text_color : "#ffffff"}
                                                onChange={(e) => patchDiscount({ text_color: e.target.value })}
                                                className="h-9 w-11 rounded border border-border cursor-pointer bg-transparent"
                                                data-testid="config-discount-text-color"
                                            />
                                            <Input
                                                value={disc.text_color || ""}
                                                onChange={(e) => patchDiscount({ text_color: e.target.value })}
                                                placeholder="#ffffff"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <Label className="label-caps">Position</Label>
                                    <Select
                                        value={disc.position || "top-right"}
                                        onValueChange={(v) => patchDiscount({ position: v })}
                                    >
                                        <SelectTrigger className="mt-1" data-testid="config-discount-position">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="top-right">Uppe höger</SelectItem>
                                            <SelectItem value="top-left">Uppe vänster</SelectItem>
                                            <SelectItem value="bottom-right">Nere höger</SelectItem>
                                            <SelectItem value="bottom-left">Nere vänster</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    <StyleEditor
                        style={c.style}
                        onChange={(s) => patchConfig({ style: s })}
                        testidPrefix="hero-style"
                    />
                </div>
            );
        }
        case "emergency_cta":
            return (
                <div className="space-y-4">
                    <TextField label="Titel" value={c.title} onChange={(v) => patchConfig({ title: v })} placeholder="Har din papegoja flugit iväg?" testid="config-title" />
                    <TextField label="Beskrivning" value={c.body} onChange={(v) => patchConfig({ body: v })} testid="config-body" rows={2} />
                    <div className="grid grid-cols-2 gap-3">
                        <TextField label="Knapptext" value={c.link_label} onChange={(v) => patchConfig({ link_label: v })} testid="config-link-label" />
                        <TextField label="Länk" value={c.link_url} onChange={(v) => patchConfig({ link_url: v })} placeholder="/rapportera-bortflygen" testid="config-link-url" />
                    </div>
                    <div>
                        <Label className="label-caps">Färgton</Label>
                        <Select value={c.tone || "destructive"} onValueChange={(v) => patchConfig({ tone: v })}>
                            <SelectTrigger data-testid="config-tone" className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="destructive">Röd (akut)</SelectItem>
                                <SelectItem value="primary">Orange (kampanj)</SelectItem>
                                <SelectItem value="success">Grön (positiv)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            );
        case "features": {
            const items = c.items || [];
            const setItem = (idx, patch) => {
                const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
                patchConfig({ items: next });
            };
            const addItem = () => patchConfig({ items: [...items, { icon: "feather", title: "Ny fördel", text: "" }] });
            const removeItem = (idx) => patchConfig({ items: items.filter((_, i) => i !== idx) });
            return (
                <div className="space-y-4">
                    <p className="label-caps">Kort ({items.length})</p>
                    {items.map((it, idx) => (
                        <div key={idx} className="rounded-md border border-border p-3 space-y-2" data-testid={`feature-item-${idx}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => removeItem(idx)}
                                    data-testid={`button-remove-feature-${idx}`}
                                >
                                    <Trash size={14} />
                                </Button>
                            </div>
                            <div>
                                <Label className="text-xs">Ikon</Label>
                                <Select value={it.icon || "feather"} onValueChange={(v) => setItem(idx, { icon: v })}>
                                    <SelectTrigger className="mt-1 h-9" data-testid={`select-icon-${idx}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="feather">Fjäder</SelectItem>
                                        <SelectItem value="shield">Sköld</SelectItem>
                                        <SelectItem value="magnifying-glass">Förstoringsglas</SelectItem>
                                        <SelectItem value="map-pin">Karta</SelectItem>
                                        <SelectItem value="heart">Hjärta</SelectItem>
                                        <SelectItem value="star">Stjärna</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Input value={it.title || ""} onChange={(e) => setItem(idx, { title: e.target.value })} placeholder="Titel" data-testid={`feature-title-${idx}`} />
                            <Textarea rows={2} value={it.text || ""} onChange={(e) => setItem(idx, { text: e.target.value })} placeholder="Text" data-testid={`feature-text-${idx}`} />
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addItem} className="w-full" data-testid="button-add-feature">
                        <Plus size={14} className="mr-2" /> Lägg till kort
                    </Button>
                </div>
            );
        }
        case "text_block":
            return (
                <div className="space-y-4">
                    <TextField label="Titel" value={c.title} onChange={(v) => patchConfig({ title: v })} testid="config-title" />
                    <div>
                        <Label className="label-caps">Innehåll (rikt textredigerare)</Label>
                        <div className="mt-1">
                            <RichTextEditor
                                value={c.content_html || (c.content ? escapeAsHtml(c.content) : "")}
                                onChange={(html) => patchConfig({ content_html: html, content: null })}
                                placeholder="Skriv brödtexten här. Använd verktygen ovanför för formatering."
                                testid="config-content-html"
                            />
                        </div>
                    </div>
                    <StyleEditor
                        style={c.style}
                        onChange={(s) => patchConfig({ style: s })}
                        testidPrefix="text-style"
                    />
                </div>
            );
        case "cta_banner":
            return (
                <div className="space-y-4">
                    <TextField label="Titel" value={c.title} onChange={(v) => patchConfig({ title: v })} testid="config-title" />
                    <TextField label="Beskrivning" value={c.body} onChange={(v) => patchConfig({ body: v })} testid="config-body" rows={2} />
                    <div className="grid grid-cols-2 gap-3">
                        <TextField label="Knapptext" value={c.link_label} onChange={(v) => patchConfig({ link_label: v })} testid="config-link-label" />
                        <TextField label="Länk" value={c.link_url} onChange={(v) => patchConfig({ link_url: v })} testid="config-link-url" />
                    </div>
                    <StyleEditor
                        style={c.style}
                        onChange={(s) => patchConfig({ style: s })}
                        testidPrefix="cta-style"
                    />
                </div>
            );
        default:
            return null;
    }
}

export default function AdminHomepage() {
    const [sections, setSections] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [newType, setNewType] = useState("hero");
    const [newLabel, setNewLabel] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const bulk = useBulkSelection(sections);

    const selected = sections.find((s) => s.id === selectedId);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/homepage");
            setSections(data);
            if (data.length && !selectedId) setSelectedId(data[0].id);
            setDirty(false);
            bulk.clear();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateLocal = (id, patch) => {
        setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
        setDirty(true);
    };

    const patchConfig = (patch) => {
        if (!selected) return;
        updateLocal(selected.id, { config: { ...selected.config, ...patch } });
    };

    const toggleVisible = async (section) => {
        try {
            const next = !section.is_visible;
            await api.patch(`/admin/homepage/${section.id}`, { is_visible: next });
            updateLocal(section.id, { is_visible: next });
            setDirty(false);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const move = async (section, delta) => {
        const idx = sections.findIndex((s) => s.id === section.id);
        const newIdx = idx + delta;
        if (newIdx < 0 || newIdx >= sections.length) return;
        const next = [...sections];
        [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
        setSections(next);
        try {
            await api.post("/admin/homepage/reorder", { ids: next.map((s) => s.id) });
        } catch (e) {
            toast.error(formatApiError(e));
            load();
        }
    };

    const duplicate = async (section) => {
        try {
            await api.post(`/admin/homepage/${section.id}/duplicate`);
            toast.success("Sektion duplicerad.");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/homepage/${confirmDelete.id}`);
            toast.success("Sektion borttagen.");
            if (selectedId === confirmDelete.id) setSelectedId(null);
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const addSection = async () => {
        try {
            const meta = SECTION_META[newType];
            const { data } = await api.post("/admin/homepage", {
                type: newType,
                label: newLabel.trim() || meta.label,
                is_visible: true,
                config: {},
            });
            toast.success("Sektion tillagd.");
            setAddOpen(false);
            setNewLabel("");
            setNewType("hero");
            await load();
            setSelectedId(data.id);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const saveSelected = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const { label, subtitle, is_visible, config } = selected;
            await api.patch(`/admin/homepage/${selected.id}`, {
                label,
                subtitle,
                is_visible,
                config,
            });
            toast.success("Sparat.");
            setDirty(false);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSaving(false);
        }
    };

    const runBulk = async (action) => {
        try {
            const { data } = await api.post("/admin/homepage/bulk", {
                ids: bulk.selectedIds,
                action,
            });
            const n = data.deleted ?? data.updated ?? bulk.selectedIds.length;
            const label =
                action === "delete" ? "borttagna" : action === "show" ? "visade" : "dolda";
            toast.success(`${n} sektion(er) ${label}.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <AdminLayout>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">CMS</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Startsida-byggare
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Dra sektioner upp/ned, anpassa innehåll och färger, lägg till nya sektioner.
                    </p>
                </div>
                <a href="/" target="_blank" rel="noreferrer">
                    <Button variant="outline" data-testid="button-preview-homepage">
                        <ArrowSquareOut size={16} className="mr-2" /> Förhandsvisa
                    </Button>
                </a>
            </div>

            {loading && (
                <div className="surface p-10 text-center text-muted-foreground">Laddar…</div>
            )}

            {!loading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Left: section list */}
                    <div className="surface p-5">
                        <div className="flex items-center justify-between mb-4">
                            <p className="font-display font-bold text-lg">
                                Sektioner ({sections.length})
                            </p>
                            <div className="flex items-center gap-2">
                                {sections.length > 0 && (
                                    <label className="flex items-center gap-1.5 text-xs">
                                        <SelectAllCheckbox
                                            allSelected={bulk.allSelected}
                                            someSelected={bulk.someSelected}
                                            onToggle={bulk.toggleAll}
                                        />
                                        <span className="text-muted-foreground">
                                            Alla
                                        </span>
                                    </label>
                                )}
                                <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-section">
                                    <Plus size={14} className="mr-1.5" /> Lägg till
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {sections.map((s, i) => (
                                <SectionListItem
                                    key={s.id}
                                    section={s}
                                    index={i}
                                    total={sections.length}
                                    active={s.id === selectedId}
                                    selected={bulk.isSelected(s.id)}
                                    onToggleSelect={() => bulk.toggle(s.id)}
                                    onSelect={() => setSelectedId(s.id)}
                                    onToggleVisible={() => toggleVisible(s)}
                                    onMove={(delta) => move(s, delta)}
                                    onDuplicate={() => duplicate(s)}
                                    onDelete={() => setConfirmDelete(s)}
                                />
                            ))}
                        </div>
                        {sections.length === 0 && (
                            <div className="text-center text-muted-foreground py-8">
                                <Rows size={24} weight="duotone" className="mx-auto mb-2" />
                                <p className="text-sm">Inga sektioner. Lägg till en.</p>
                            </div>
                        )}
                    </div>

                    {/* Right: editor */}
                    <div className="surface p-5">
                        {!selected ? (
                            <div className="text-center py-16 text-muted-foreground">
                                <Layout size={28} weight="duotone" className="mx-auto mb-2" />
                                <p className="text-sm">Välj en sektion till vänster för att redigera.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-start justify-between mb-4 pb-4 border-b border-border">
                                    <div>
                                        <p className="font-display font-bold text-lg">
                                            {selected.label}
                                        </p>
                                        <p className="text-xs font-mono text-muted-foreground">
                                            {selected.type}-{selected.sort_order + 1}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={selected.is_visible}
                                            onCheckedChange={(v) => updateLocal(selected.id, { is_visible: v })}
                                            data-testid="switch-section-visible"
                                        />
                                        <span className="text-xs text-muted-foreground">
                                            {selected.is_visible ? "Synlig" : "Dold"}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-6">
                                    <TextField
                                        label="Etikett (visas bara för admin)"
                                        value={selected.label}
                                        onChange={(v) => updateLocal(selected.id, { label: v })}
                                        testid="input-section-label"
                                    />
                                    <TextField
                                        label="Undertext (bara för admin)"
                                        value={selected.subtitle}
                                        onChange={(v) => updateLocal(selected.id, { subtitle: v })}
                                        testid="input-section-subtitle"
                                    />
                                </div>

                                <div className="border-t border-border pt-5">
                                    <ConfigField section={selected} patchConfig={patchConfig} updateConfig={(c) => updateLocal(selected.id, { config: c })} />
                                </div>

                                <div className="mt-6 pt-4 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card">
                                    <Button
                                        variant="outline"
                                        onClick={() => load()}
                                        disabled={!dirty}
                                    >
                                        Återställ
                                    </Button>
                                    <Button
                                        onClick={saveSelected}
                                        disabled={!dirty || saving}
                                        data-testid="button-save-section"
                                    >
                                        {saving ? "Sparar…" : dirty ? "Spara ändringar" : "Sparat"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Lägg till sektion</DialogTitle>
                        <DialogDescription>
                            Välj typ av sektion att lägga till på startsidan.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label>Typ</Label>
                            <Select value={newType} onValueChange={setNewType}>
                                <SelectTrigger className="mt-1" data-testid="select-new-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(SECTION_META).map(([key, meta]) => (
                                        <SelectItem key={key} value={key}>
                                            {meta.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Etikett (valfritt)</Label>
                            <Input
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder={SECTION_META[newType].label}
                                data-testid="input-new-label"
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Avbryt</Button>
                        <Button onClick={addSection} data-testid="button-confirm-add-section">
                            Lägg till
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort sektion?</AlertDialogTitle>
                        <AlertDialogDescription>
                            "{confirmDelete?.label}" tas bort permanent från startsidan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-section"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="sektioner"
                actions={[
                    {
                        key: "show",
                        label: "Visa",
                        icon: <Eye size={14} />,
                        tone: "success",
                        confirm: `Visa ${bulk.count} sektion(er) på startsidan?`,
                        onRun: () => runBulk("show"),
                    },
                    {
                        key: "hide",
                        label: "Dölj",
                        icon: <EyeSlash size={14} />,
                        confirm: `Dölj ${bulk.count} sektion(er) från startsidan?`,
                        onRun: () => runBulk("hide"),
                    },
                    {
                        key: "delete",
                        label: "Ta bort",
                        icon: <Trash size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} sektion(er) tas bort permanent.`,
                        onRun: () => runBulk("delete"),
                    },
                ]}
            />
        </AdminLayout>
    );
}
