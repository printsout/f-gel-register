import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    FileText,
    PencilSimple,
    Trash,
    Plus,
    Globe,
    EyeSlash,
    ArrowSquareOut,
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

function slugify(input) {
    return String(input || "")
        .toLowerCase()
        .trim()
        .replace(/[åä]/g, "a")
        .replace(/[ö]/g, "o")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

const EMPTY = { slug: "", title: "", content: "", is_published: true };

export default function AdminContent() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(null); // 'new' | 'edit'
    const [form, setForm] = useState(EMPTY);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/content");
            setItems(data);
            bulk.clear();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const openNew = () => {
        setForm(EMPTY);
        setSlugManuallyEdited(false);
        setDialog("new");
    };

    const openEdit = (page) => {
        setForm({
            id: page.id,
            slug: page.slug,
            title: page.title,
            content: page.content || "",
            is_published: !!page.is_published,
        });
        setSlugManuallyEdited(true);
        setDialog("edit");
    };

    const submit = async () => {
        try {
            if (dialog === "new") {
                const payload = {
                    slug: slugify(form.slug || form.title),
                    title: form.title,
                    content: form.content,
                    is_published: form.is_published,
                };
                await api.post("/admin/content", payload);
                toast.success("Sidan skapad.");
            } else {
                await api.patch(`/admin/content/${form.id}`, {
                    title: form.title,
                    content: form.content,
                    is_published: form.is_published,
                });
                toast.success("Sidan uppdaterad.");
            }
            setDialog(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/content/${confirmDelete.id}`);
            toast.success("Sidan borttagen.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const togglePublish = async (page) => {
        try {
            await api.patch(`/admin/content/${page.id}`, {
                is_published: !page.is_published,
            });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const runBulkDelete = async () => {
        try {
            const { data } = await api.post("/admin/content/bulk-delete", {
                ids: bulk.selectedIds,
            });
            toast.success(`${data.deleted} sida/sidor borttagna.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">CMS</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Innehåll
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Hantera sidor som "Om oss", "Kontakt" och villkor
                    </p>
                </div>
                <Button onClick={openNew} data-testid="button-new-content">
                    <Plus size={16} className="mr-2" /> Ny sida
                </Button>
            </div>

            <div className="surface overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                    <p className="font-display font-bold text-lg">
                        Sidor ({items.length})
                    </p>
                    {items.length > 0 && (
                        <label className="flex items-center gap-2 text-sm">
                            <SelectAllCheckbox
                                allSelected={bulk.allSelected}
                                someSelected={bulk.someSelected}
                                onToggle={bulk.toggleAll}
                            />
                            <span className="text-muted-foreground">Markera alla</span>
                        </label>
                    )}
                </div>

                {loading && (
                    <div className="p-10 text-center text-muted-foreground">Laddar…</div>
                )}
                {!loading && items.length === 0 && (
                    <div className="p-10 text-center text-muted-foreground">
                        <FileText size={28} weight="duotone" className="mx-auto mb-2" />
                        Inga sidor än — skapa den första.
                    </div>
                )}

                <ul className="divide-y divide-border">
                    {items.map((p) => (
                        <li
                            key={p.id}
                            className={`p-5 flex items-center gap-4 hover:bg-muted/30 transition-colors ${bulk.isSelected(p.id) ? "bg-primary/5" : ""}`}
                            data-testid={`content-row-${p.id}`}
                        >
                            <Checkbox
                                checked={bulk.isSelected(p.id)}
                                onCheckedChange={() => bulk.toggle(p.id)}
                                data-testid={`bulk-select-row-${p.id}`}
                            />
                            <div
                                className="w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0"
                                style={{ background: "hsl(var(--muted))" }}
                            >
                                <FileText
                                    size={22}
                                    weight="duotone"
                                    className="text-muted-foreground"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-display font-bold">
                                        {p.title}
                                    </span>
                                    {!p.is_published && (
                                        <Badge
                                            variant="outline"
                                            className="text-xs bg-muted"
                                        >
                                            <EyeSlash size={10} className="mr-1" />
                                            Utkast
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                                    <Globe size={13} />
                                    <span className="font-mono">/{p.slug}</span>
                                    <span className="mx-1">·</span>
                                    <span className="text-xs">
                                        {p.updated_at?.slice(0, 10)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Switch
                                    checked={!!p.is_published}
                                    onCheckedChange={() => togglePublish(p)}
                                    data-testid={`switch-publish-${p.id}`}
                                />
                                <a
                                    href={`/sidor/${p.slug}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ml-2"
                                    title="Öppna publikt"
                                >
                                    <Button variant="ghost" size="sm" data-testid={`button-view-content-${p.id}`}>
                                        <ArrowSquareOut size={16} />
                                    </Button>
                                </a>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEdit(p)}
                                    data-testid={`button-edit-content-${p.id}`}
                                >
                                    <PencilSimple size={16} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() => setConfirmDelete(p)}
                                    data-testid={`button-delete-content-${p.id}`}
                                >
                                    <Trash size={16} />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {dialog === "new" ? "Ny sida" : `Redigera "${form.title}"`}
                        </DialogTitle>
                        <DialogDescription>
                            Använd Markdown för formatering. Ändringar syns direkt
                            på den publika sidan om den är publicerad.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="c-title">Titel</Label>
                            <Input
                                id="c-title"
                                data-testid="input-content-title"
                                value={form.title}
                                onChange={(e) => {
                                    const title = e.target.value;
                                    setForm({
                                        ...form,
                                        title,
                                        slug:
                                            dialog === "new" && !slugManuallyEdited
                                                ? slugify(title)
                                                : form.slug,
                                    });
                                }}
                                placeholder="t.ex. Om oss"
                            />
                        </div>
                        <div>
                            <Label htmlFor="c-slug">
                                URL-slug{" "}
                                <span className="text-xs text-muted-foreground font-mono">
                                    /sidor/{form.slug || "..."}
                                </span>
                            </Label>
                            <Input
                                id="c-slug"
                                data-testid="input-content-slug"
                                disabled={dialog === "edit"}
                                value={form.slug}
                                onChange={(e) => {
                                    setSlugManuallyEdited(true);
                                    setForm({ ...form, slug: slugify(e.target.value) });
                                }}
                                placeholder="om-oss"
                                className="font-mono"
                            />
                            {dialog === "edit" && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Slug kan inte ändras efter att sidan skapats.
                                </p>
                            )}
                        </div>
                        <div>
                            <Label htmlFor="c-content">
                                Innehåll{" "}
                                <span className="text-xs text-muted-foreground">
                                    (Markdown stöds — # rubrik, **fet**, [länk](url))
                                </span>
                            </Label>
                            <Textarea
                                id="c-content"
                                data-testid="input-content-body"
                                rows={14}
                                className="font-mono text-sm"
                                value={form.content}
                                onChange={(e) => setForm({ ...form, content: e.target.value })}
                                placeholder="## Rubrik&#10;&#10;Skriv innehållet här…"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {form.content.length} tecken
                            </p>
                        </div>
                        <label className="flex items-center gap-3">
                            <Switch
                                checked={form.is_published}
                                onCheckedChange={(v) => setForm({ ...form, is_published: v })}
                                data-testid="switch-content-published"
                            />
                            <span className="text-sm">
                                Publicerad — synlig för besökare
                            </span>
                        </label>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialog(null)}>
                            Avbryt
                        </Button>
                        <Button onClick={submit} data-testid="button-save-content">
                            Spara
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort sida?</AlertDialogTitle>
                        <AlertDialogDescription>
                            "{confirmDelete?.title}" (/{confirmDelete?.slug}) tas
                            bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-content"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="sidor"
                actions={[
                    {
                        key: "delete",
                        label: "Ta bort",
                        icon: <Trash size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} sida/sidor tas bort permanent.`,
                        onRun: runBulkDelete,
                    },
                ]}
            />
        </AdminLayout>
    );
}
