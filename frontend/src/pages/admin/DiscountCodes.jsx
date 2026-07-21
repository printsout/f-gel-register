import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, PencilSimple, Trash, TicketIcon } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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

const EMPTY = {
    code: "",
    discount_type: "percent",
    discount_percentage: 15,
    discount_amount: 50,
    expiry_date: "",
    usage_limit: "",
    is_active: true,
};

export default function DiscountCodes() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(null); // 'new' | code obj
    const [form, setForm] = useState(EMPTY);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/discount-codes");
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
        setDialog("new");
    };

    const openEdit = (c) => {
        const dtype = c.discount_type || (c.discount_amount ? "amount" : "percent");
        setForm({
            code: c.code,
            discount_type: dtype,
            discount_percentage: c.discount_percentage ?? 15,
            discount_amount: c.discount_amount ?? 50,
            expiry_date: c.expiry_date || "",
            usage_limit: c.usage_limit || "",
            is_active: !!c.is_active,
            id: c.id,
        });
        setDialog("edit");
    };

    const submit = async () => {
        try {
            const isPct = form.discount_type === "percent";
            const payload = {
                discount_type: form.discount_type,
                discount_percentage: isPct ? parseInt(form.discount_percentage, 10) : null,
                discount_amount: !isPct ? parseInt(form.discount_amount, 10) : null,
                expiry_date: form.expiry_date || null,
                usage_limit: form.usage_limit ? parseInt(form.usage_limit, 10) : null,
                is_active: form.is_active,
            };
            if (dialog === "new") {
                await api.post("/admin/discount-codes", {
                    ...payload,
                    code: form.code,
                });
                toast.success("Rabattkod skapad.");
            } else {
                await api.patch(`/admin/discount-codes/${form.id}`, payload);
                toast.success("Rabattkod uppdaterad.");
            }
            setDialog(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/discount-codes/${confirmDelete.id}`);
            toast.success("Borttagen.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const toggleActive = async (c) => {
        try {
            await api.patch(`/admin/discount-codes/${c.id}`, {
                is_active: !c.is_active,
            });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const runBulkDelete = async () => {
        try {
            const { data } = await api.post("/admin/discount-codes/bulk-delete", {
                ids: bulk.selectedIds,
            });
            toast.success(`${data.deleted} rabattkod(er) borttagna.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Marknadsföring</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Rabattkoder
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} koder
                    </p>
                </div>
                <Button onClick={openNew} data-testid="button-new-discount">
                    <Plus size={16} className="mr-2" />
                    Ny kod
                </Button>
            </div>

            <div className="surface overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10">
                                <SelectAllCheckbox
                                    allSelected={bulk.allSelected}
                                    someSelected={bulk.someSelected}
                                    onToggle={bulk.toggleAll}
                                />
                            </TableHead>
                            <TableHead>Kod</TableHead>
                            <TableHead>Rabatt</TableHead>
                            <TableHead>Utgår</TableHead>
                            <TableHead>Använd</TableHead>
                            <TableHead>Aktiv</TableHead>
                            <TableHead className="text-right">Åtgärder</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                    Laddar…
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && items.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                    <TicketIcon size={28} weight="duotone" className="mx-auto mb-2" />
                                    Inga rabattkoder skapade än.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            items.map((c) => (
                                <TableRow
                                    key={c.id}
                                    data-testid={`row-discount-${c.id}`}
                                    data-state={bulk.isSelected(c.id) ? "selected" : undefined}
                                >
                                    <TableCell>
                                        <Checkbox
                                            checked={bulk.isSelected(c.id)}
                                            onCheckedChange={() => bulk.toggle(c.id)}
                                            data-testid={`bulk-select-row-${c.id}`}
                                        />
                                    </TableCell>
                                    <TableCell className="font-mono font-semibold">
                                        {c.code}
                                    </TableCell>
                                    <TableCell>
                                        <Badge>
                                            {(c.discount_type || (c.discount_amount ? "amount" : "percent")) === "amount"
                                                ? `${c.discount_amount} kr`
                                                : `${c.discount_percentage}%`}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {c.expiry_date || "—"}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {c.used_count}
                                        {c.usage_limit ? ` / ${c.usage_limit}` : ""}
                                    </TableCell>
                                    <TableCell>
                                        <Switch
                                            checked={!!c.is_active}
                                            onCheckedChange={() => toggleActive(c)}
                                            data-testid={`switch-active-${c.id}`}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEdit(c)}
                                            data-testid={`button-edit-discount-${c.id}`}
                                        >
                                            <PencilSimple size={16} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => setConfirmDelete(c)}
                                            data-testid={`button-delete-discount-${c.id}`}
                                        >
                                            <Trash size={16} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {dialog === "new" ? "Ny rabattkod" : "Redigera kod"}
                        </DialogTitle>
                        <DialogDescription>
                            Rabattkoder ger antingen procentuell rabatt eller ett fast belopp i
                            kronor på registreringsavgiften.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Kod</Label>
                            <Input
                                value={form.code}
                                disabled={dialog === "edit"}
                                onChange={(e) =>
                                    setForm({ ...form, code: e.target.value.toUpperCase() })
                                }
                                placeholder="PARROTS15"
                                data-testid="input-discount-code"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Rabatt-typ</Label>
                                <Select
                                    value={form.discount_type}
                                    onValueChange={(v) =>
                                        setForm({ ...form, discount_type: v })
                                    }
                                >
                                    <SelectTrigger
                                        className="mt-1"
                                        data-testid="select-discount-type"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percent">Procent (%)</SelectItem>
                                        <SelectItem value="amount">Kronor (kr)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.discount_type === "percent" ? (
                                <div>
                                    <Label>Rabatt (%)</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={form.discount_percentage}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                discount_percentage: e.target.value,
                                            })
                                        }
                                        data-testid="input-discount-percentage"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <Label>Rabatt (kr)</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={form.discount_amount}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                discount_amount: e.target.value,
                                            })
                                        }
                                        data-testid="input-discount-amount"
                                    />
                                </div>
                            )}
                        </div>
                        <div>
                            <Label>Utgår (valfritt)</Label>
                            <Input
                                type="date"
                                value={form.expiry_date || ""}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        expiry_date: e.target.value,
                                    })
                                }
                                data-testid="input-discount-expiry"
                            />
                        </div>
                        <div>
                            <Label>Användningsgräns (valfritt)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={form.usage_limit || ""}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        usage_limit: e.target.value,
                                    })
                                }
                                data-testid="input-discount-limit"
                            />
                        </div>
                        <label className="flex items-center gap-3">
                            <Switch
                                checked={form.is_active}
                                onCheckedChange={(v) =>
                                    setForm({ ...form, is_active: v })
                                }
                                data-testid="switch-discount-active"
                            />
                            <span className="text-sm">Aktiv</span>
                        </label>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialog(null)}>
                            Avbryt
                        </Button>
                        <Button onClick={submit} data-testid="button-save-discount">
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
                        <AlertDialogTitle>Ta bort rabattkod?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Koden {confirmDelete?.code} tas bort.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-discount"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="rabattkoder"
                actions={[
                    {
                        key: "delete",
                        label: "Ta bort",
                        icon: <Trash size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} rabattkod(er) tas bort permanent.`,
                        onRun: runBulkDelete,
                    },
                ]}
            />
        </AdminLayout>
    );
}
