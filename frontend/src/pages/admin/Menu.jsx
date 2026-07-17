import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    Plus,
    Eye,
    EyeSlash,
    ArrowUp,
    ArrowDown,
    Trash,
    PencilSimple,
    ArrowSquareOut,
    List as ListIcon,
    CaretRight,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import BulkActionsBar, { SelectAllCheckbox } from "@/components/BulkActionsBar";
import { useBulkSelection } from "@/hooks/useBulkSelection";
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

const EMPTY = { label: "", url: "", parent_id: "none", is_visible: true };

function ItemRow({ item, index, siblings, isChild, onEdit, onDelete, onToggleVisible, onMove, selected, onToggleSelect }) {
    const total = siblings.length;
    return (
        <div
            className={`rounded-md border transition-colors ${isChild ? "border-border/60 bg-muted/30 ml-8" : "border-border bg-card"} ${selected ? "ring-2 ring-primary" : ""}`}
            data-testid={`menu-item-${item.id}`}
        >
            <div className="p-3 flex items-center gap-3">
                <Checkbox
                    checked={selected}
                    onCheckedChange={onToggleSelect}
                    data-testid={`bulk-select-row-${item.id}`}
                />
                {isChild && (
                    <CaretRight
                        size={14}
                        className="text-muted-foreground flex-shrink-0"
                    />
                )}
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                        {item.label}
                        {!item.is_visible && (
                            <Badge variant="outline" className="text-[10px] bg-muted">
                                Dold
                            </Badge>
                        )}
                        {!isChild && item.childrenCount > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                                {item.childrenCount} rullgardin-val
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                        {item.url}
                    </p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onToggleVisible(item)}
                        data-testid={`button-toggle-visible-${item.id}`}
                    >
                        {item.is_visible ? <Eye size={14} /> : <EyeSlash size={14} />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === 0}
                        onClick={() => onMove(item, -1)}
                        data-testid={`button-move-up-${item.id}`}
                    >
                        <ArrowUp size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === total - 1}
                        onClick={() => onMove(item, 1)}
                        data-testid={`button-move-down-${item.id}`}
                    >
                        <ArrowDown size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(item)}
                        data-testid={`button-edit-menu-${item.id}`}
                    >
                        <PencilSimple size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => onDelete(item)}
                        data-testid={`button-delete-menu-${item.id}`}
                    >
                        <Trash size={14} />
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function AdminMenu() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(null); // 'new' | 'edit'
    const [form, setForm] = useState(EMPTY);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/menu");
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

    // Group into tree
    const tree = useMemo(() => {
        const tops = items
            .filter((i) => !i.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order);
        const byParent = {};
        items.forEach((i) => {
            if (i.parent_id) {
                byParent[i.parent_id] = byParent[i.parent_id] || [];
                byParent[i.parent_id].push(i);
            }
        });
        Object.values(byParent).forEach((arr) => arr.sort((a, b) => a.sort_order - b.sort_order));
        return tops.map((t) => ({
            ...t,
            children: byParent[t.id] || [],
            childrenCount: (byParent[t.id] || []).length,
        }));
    }, [items]);

    const openNew = (parentId = "none") => {
        setForm({ ...EMPTY, parent_id: parentId });
        setDialog("new");
    };

    const openEdit = (item) => {
        setForm({
            id: item.id,
            label: item.label,
            url: item.url,
            parent_id: item.parent_id || "none",
            is_visible: item.is_visible,
            has_children: items.some((i) => i.parent_id === item.id),
        });
        setDialog("edit");
    };

    const submit = async () => {
        try {
            const payload = {
                label: form.label.trim(),
                url: form.url.trim(),
                parent_id: form.parent_id === "none" ? null : form.parent_id,
                is_visible: form.is_visible,
            };
            if (dialog === "new") {
                await api.post("/admin/menu", payload);
                toast.success("Menyval skapat.");
            } else {
                await api.patch(`/admin/menu/${form.id}`, payload);
                toast.success("Menyval uppdaterat.");
            }
            setDialog(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const toggleVisible = async (item) => {
        try {
            await api.patch(`/admin/menu/${item.id}`, { is_visible: !item.is_visible });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const move = async (item, delta) => {
        const siblings = item.parent_id
            ? items.filter((i) => i.parent_id === item.parent_id)
            : items.filter((i) => !i.parent_id);
        siblings.sort((a, b) => a.sort_order - b.sort_order);
        const idx = siblings.findIndex((i) => i.id === item.id);
        const newIdx = idx + delta;
        if (newIdx < 0 || newIdx >= siblings.length) return;
        const reordered = [...siblings];
        [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
        try {
            await api.post("/admin/menu/reorder", { ids: reordered.map((i) => i.id) });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/menu/${confirmDelete.id}`);
            toast.success("Menyval borttaget.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const runBulkDelete = async () => {
        try {
            const { data } = await api.post("/admin/menu/bulk-delete", {
                ids: bulk.selectedIds,
            });
            toast.success(`${data.deleted} menyval borttagna.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    // Available parent options (only top-level items that don't have parent themselves)
    const topLevelOptions = items.filter((i) => !i.parent_id);

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Navigation</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Meny (rullgardin)
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Bygg toppmenyn — lägg till huvudval och rullgardins-val under dem.
                    </p>
                </div>
                <div className="flex gap-2">
                    <a href="/" target="_blank" rel="noreferrer">
                        <Button variant="outline" data-testid="button-preview-menu">
                            <ArrowSquareOut size={16} className="mr-2" /> Förhandsvisa
                        </Button>
                    </a>
                    <Button onClick={() => openNew("none")} data-testid="button-new-menu-top">
                        <Plus size={16} className="mr-2" /> Nytt huvudval
                    </Button>
                </div>
            </div>

            {loading && (
                <div className="surface p-10 text-center text-muted-foreground">Laddar…</div>
            )}

            {!loading && (
                <div className="surface p-5">
                    <p className="font-display font-bold text-lg mb-4">
                        Menystruktur ({items.length} val)
                    </p>
                    {tree.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground">
                            <ListIcon size={26} weight="duotone" className="mx-auto mb-2" />
                            <p className="text-sm mb-4">Ingen meny ännu.</p>
                            <Button onClick={() => openNew("none")}>
                                <Plus size={14} className="mr-2" /> Skapa första menyvalet
                            </Button>
                        </div>
                    )}
                    <div className="space-y-2">
                        {tree.map((top, tIdx) => (
                            <div key={top.id} className="space-y-2">
                                <ItemRow
                                    item={top}
                                    index={tIdx}
                                    siblings={tree}
                                    isChild={false}
                                    onEdit={openEdit}
                                    onDelete={setConfirmDelete}
                                    onToggleVisible={toggleVisible}
                                    onMove={move}
                                    selected={bulk.isSelected(top.id)}
                                    onToggleSelect={() => bulk.toggle(top.id)}
                                />
                                <div className="space-y-1.5">
                                    {top.children.map((c, cIdx) => (
                                        <ItemRow
                                            key={c.id}
                                            item={c}
                                            index={cIdx}
                                            siblings={top.children}
                                            isChild
                                            onEdit={openEdit}
                                            onDelete={setConfirmDelete}
                                            onToggleVisible={toggleVisible}
                                            onMove={move}
                                            selected={bulk.isSelected(c.id)}
                                            onToggleSelect={() => bulk.toggle(c.id)}
                                        />
                                    ))}
                                    <div className="ml-8">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs text-muted-foreground hover:text-foreground"
                                            onClick={() => openNew(top.id)}
                                            data-testid={`button-add-sub-${top.id}`}
                                        >
                                            <Plus size={12} className="mr-1" /> Lägg till rullgardin-val
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {dialog === "new" ? "Nytt menyval" : "Redigera menyval"}
                        </DialogTitle>
                        <DialogDescription>
                            Ange etikett, länk och (valfritt) vilket huvudval detta hamnar under.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Etikett</Label>
                            <Input
                                value={form.label}
                                onChange={(e) => setForm({ ...form, label: e.target.value })}
                                placeholder="t.ex. Om oss"
                                data-testid="input-menu-label"
                            />
                        </div>
                        <div>
                            <Label>Länk (URL)</Label>
                            <Input
                                value={form.url}
                                onChange={(e) => setForm({ ...form, url: e.target.value })}
                                placeholder="/sidor/om-oss eller https://..."
                                data-testid="input-menu-url"
                                className="font-mono"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Använd <code>#</code> om huvudvalet bara ska visa rullgardinen utan egen länk.
                            </p>
                        </div>
                        <div>
                            <Label>Placering</Label>
                            <Select
                                value={form.parent_id}
                                onValueChange={(v) => setForm({ ...form, parent_id: v })}
                                disabled={form.has_children}
                            >
                                <SelectTrigger data-testid="select-menu-parent">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Huvudmeny (top-nivå)</SelectItem>
                                    {topLevelOptions
                                        .filter((t) => t.id !== form.id)
                                        .map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                Under: {t.label}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            {form.has_children && (
                                <p className="text-xs text-warning-foreground mt-1">
                                    Detta menyval har underval – flytta dem först innan du gör detta till en underrubrik.
                                </p>
                            )}
                        </div>
                        <label className="flex items-center gap-3">
                            <Switch
                                checked={form.is_visible}
                                onCheckedChange={(v) => setForm({ ...form, is_visible: v })}
                                data-testid="switch-menu-visible"
                            />
                            <span className="text-sm">Synlig i menyn</span>
                        </label>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialog(null)}>Avbryt</Button>
                        <Button onClick={submit} data-testid="button-save-menu">
                            Spara
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort menyval?</AlertDialogTitle>
                        <AlertDialogDescription>
                            "{confirmDelete?.label}" tas bort permanent
                            {items.some((i) => i.parent_id === confirmDelete?.id)
                                ? ", inklusive alla dess underval."
                                : "."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-menu"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="menyval"
                actions={[
                    {
                        key: "delete",
                        label: "Ta bort",
                        icon: <Trash size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} menyval tas bort permanent. Barnval av dessa kopplas loss.`,
                        onRun: runBulkDelete,
                    },
                ]}
            />
        </AdminLayout>
    );
}
