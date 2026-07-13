import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    MagnifyingGlass,
    PencilSimple,
    Trash,
    DownloadSimple,
    Bird,
    X,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { API, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

const STATUS_LABEL = {
    pending: { label: "Väntande", tone: "warning" },
    processing: { label: "Behandlas", tone: "info" },
    completed: { label: "Betald", tone: "success" },
    cancelled: { label: "Avbruten", tone: "danger" },
};

function StatusBadge({ status }) {
    const meta = STATUS_LABEL[status] || { label: status, tone: "default" };
    const cls =
        meta.tone === "success"
            ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
            : meta.tone === "warning"
              ? "bg-[hsl(var(--warning))]/15 text-yellow-700 border-yellow-500/40"
              : meta.tone === "danger"
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-secondary text-secondary-foreground border-border";
    return (
        <Badge variant="outline" className={cls}>
            {meta.label}
        </Badge>
    );
}

export default function RegisteredBirds() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
    const [editing, setEditing] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (q) params.search = q;
            if (status !== "all") params.payment_status = status;
            const { data } = await api.get("/admin/registered-birds", { params });
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, status]);

    const doDelete = async () => {
        try {
            await api.delete(`/admin/registered-birds/${confirmDelete.id}`);
            toast.success("Fågel borttagen.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const saveEdit = async () => {
        try {
            const { id, ...updates } = editing;
            await api.patch(`/admin/registered-birds/${id}`, updates);
            toast.success("Uppdaterad.");
            setEditing(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Fåglar</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Registrerade fåglar
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} fåglar
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() =>
                        window.open(
                            `${API}/admin/registered-birds/export/csv`,
                            "_blank",
                        )
                    }
                    data-testid="button-export-birds-csv"
                >
                    <DownloadSimple size={16} className="mr-2" />
                    Exportera CSV
                </Button>
            </div>

            <div className="surface p-4 mb-6 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[240px]">
                    <MagnifyingGlass
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        className="pl-9"
                        placeholder="Sök på ringnr, ägare, art…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-birds"
                    />
                </div>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-[180px]" data-testid="select-status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alla statusar</SelectItem>
                        <SelectItem value="pending">Väntande</SelectItem>
                        <SelectItem value="processing">Behandlas</SelectItem>
                        <SelectItem value="completed">Betald</SelectItem>
                        <SelectItem value="cancelled">Avbruten</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="surface overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Art</TableHead>
                            <TableHead>Ringnr</TableHead>
                            <TableHead>Ägare</TableHead>
                            <TableHead>Telefon</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Åtgärder</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="text-center py-10 text-muted-foreground"
                                >
                                    Laddar…
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && items.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="text-center py-10 text-muted-foreground"
                                >
                                    <Bird
                                        size={28}
                                        weight="duotone"
                                        className="mx-auto mb-2 text-muted-foreground"
                                    />
                                    Inga fåglar matchar.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            items.map((b) => (
                                <TableRow
                                    key={b.id}
                                    data-testid={`row-bird-${b.id}`}
                                >
                                    <TableCell className="font-medium">
                                        {b.species}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {b.ring_number}
                                    </TableCell>
                                    <TableCell>{b.owner_name}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {b.phone_number}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {b.registration_date}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={b.payment_status} />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditing(b)}
                                            data-testid={`button-edit-bird-${b.id}`}
                                        >
                                            <PencilSimple size={16} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => setConfirmDelete(b)}
                                            data-testid={`button-delete-bird-${b.id}`}
                                        >
                                            <Trash size={16} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>

            {/* Edit dialog */}
            <Dialog
                open={!!editing}
                onOpenChange={(v) => !v && setEditing(null)}
            >
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Redigera fågel</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <Label>Art</Label>
                                <Input
                                    value={editing.species || ""}
                                    onChange={(e) =>
                                        setEditing({
                                            ...editing,
                                            species: e.target.value,
                                        })
                                    }
                                    data-testid="edit-input-species"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label>Ringnummer</Label>
                                    <Input
                                        value={editing.ring_number || ""}
                                        onChange={(e) =>
                                            setEditing({
                                                ...editing,
                                                ring_number: e.target.value,
                                            })
                                        }
                                        data-testid="edit-input-ring-number"
                                    />
                                </div>
                                <div>
                                    <Label>Ägare</Label>
                                    <Input
                                        value={editing.owner_name || ""}
                                        onChange={(e) =>
                                            setEditing({
                                                ...editing,
                                                owner_name: e.target.value,
                                            })
                                        }
                                        data-testid="edit-input-owner-name"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Telefon</Label>
                                <Input
                                    value={editing.phone_number || ""}
                                    onChange={(e) =>
                                        setEditing({
                                            ...editing,
                                            phone_number: e.target.value,
                                        })
                                    }
                                    data-testid="edit-input-phone-number"
                                />
                            </div>
                            <div>
                                <Label>Betalstatus</Label>
                                <Select
                                    value={editing.payment_status}
                                    onValueChange={(v) =>
                                        setEditing({
                                            ...editing,
                                            payment_status: v,
                                        })
                                    }
                                >
                                    <SelectTrigger data-testid="edit-select-status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">
                                            Väntande
                                        </SelectItem>
                                        <SelectItem value="processing">
                                            Behandlas
                                        </SelectItem>
                                        <SelectItem value="completed">
                                            Betald
                                        </SelectItem>
                                        <SelectItem value="cancelled">
                                            Avbruten
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Ytterligare info</Label>
                                <Textarea
                                    rows={3}
                                    value={editing.additional_info || ""}
                                    onChange={(e) =>
                                        setEditing({
                                            ...editing,
                                            additional_info: e.target.value,
                                        })
                                    }
                                    data-testid="edit-input-additional"
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setEditing(null)}
                        >
                            Avbryt
                        </Button>
                        <Button onClick={saveEdit} data-testid="button-save-bird">
                            Spara
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete confirm */}
            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort fågel?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDelete?.species} –{" "}
                            <span className="font-mono">
                                {confirmDelete?.ring_number}
                            </span>{" "}
                            kommer tas bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-bird"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}
