import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    MagnifyingGlass,
    Trash,
    DownloadSimple,
    WarningCircle,
    Phone,
    EnvelopeSimple,
    MapPin,
    Calendar,
    Bell,
    CheckCircle,
    Feather,
    CurrencyCircleDollar,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { API, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import BulkActionsBar, { SelectAllCheckbox } from "@/components/BulkActionsBar";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import {
    Tabs,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
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

function StatusBadge({ status }) {
    if (status === "found")
        return (
            <Badge
                className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
                variant="outline"
            >
                <CheckCircle size={12} className="mr-1" /> Hittad
            </Badge>
        );
    if (status === "closed")
        return (
            <Badge variant="outline">Avslutad</Badge>
        );
    return (
        <Badge
            className="bg-destructive/10 text-destructive border-destructive/30"
            variant="outline"
        >
            <WarningCircle size={12} className="mr-1" /> Sökes
        </Badge>
    );
}

function MissingCard({ report, onUpdate, onNotify, onDelete, selected, onToggleSelect }) {
    const isDone = report.status !== "searching";
    return (
        <div
            className={`surface p-5 fade-in relative ${selected ? "ring-2 ring-primary" : ""}`}
            data-testid={`missing-${report.id}`}
        >
            <div className="absolute top-4 left-4">
                <Checkbox
                    checked={selected}
                    onCheckedChange={onToggleSelect}
                    data-testid={`bulk-select-row-${report.id}`}
                    aria-label="Markera rapport"
                />
            </div>
            <div className="flex items-start justify-between gap-3 mb-3 pl-8">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={report.status} />
                        <span className="text-xs text-muted-foreground">
                            Rapporterad {report.created_at?.slice(0, 10)}
                        </span>
                        {report.notified_at && (
                            <Badge variant="outline" className="text-xs">
                                <Bell size={10} className="mr-1" /> Meddelad
                            </Badge>
                        )}
                    </div>
                    <h3 className="font-display text-lg font-bold flex items-center gap-2">
                        <Feather size={18} weight="duotone" className="text-primary" />
                        {report.species}
                        {report.ring_number && (
                            <span className="font-mono text-xs text-muted-foreground">
                                · {report.ring_number}
                            </span>
                        )}
                    </h3>
                </div>
            </div>

            <p className="text-sm mb-3">{report.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3 pb-3 border-b border-border">
                <div className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-muted-foreground" />
                    <span>{report.last_seen_location}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-muted-foreground" />
                    <span>Senast sedd {report.last_seen_date}</span>
                </div>
                {report.reward_offered && (
                    <div className="flex items-center gap-1.5">
                        <CurrencyCircleDollar
                            size={14}
                            className="text-[hsl(var(--warning))]"
                        />
                        <span className="font-medium">Hittelön: {report.reward_offered}</span>
                    </div>
                )}
            </div>

            <div className="rounded-md bg-muted/50 p-3 mb-3 space-y-1.5">
                <p className="label-caps text-xs">Kontakt (privat)</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium">{report.owner_name}</span>
                    <a
                        href={`tel:${report.contact_phone}`}
                        className="flex items-center gap-1 font-mono text-primary hover:underline"
                        data-testid={`link-call-${report.id}`}
                    >
                        <Phone size={13} /> {report.contact_phone}
                    </a>
                    {report.contact_email && (
                        <a
                            href={`mailto:${report.contact_email}`}
                            className="flex items-center gap-1 text-primary hover:underline"
                            data-testid={`link-email-${report.id}`}
                        >
                            <EnvelopeSimple size={13} /> {report.contact_email}
                        </a>
                    )}
                </div>
            </div>

            {report.admin_notes && (
                <div className="rounded-md bg-accent/50 p-3 mb-3 text-xs">
                    <p className="label-caps mb-1">Admin-anteckningar</p>
                    <p>{report.admin_notes}</p>
                </div>
            )}

            {report.notification_message && (
                <div className="rounded-md bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 p-3 mb-3 text-xs">
                    <p className="label-caps mb-1 text-[hsl(var(--success))]">
                        Meddelande skickat {report.notified_at?.slice(0, 10)}
                    </p>
                    <p>{report.notification_message}</p>
                </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-2">
                {!isDone && (
                    <Button
                        size="sm"
                        onClick={() => onUpdate(report, { status: "found" })}
                        data-testid={`button-mark-found-${report.id}`}
                        className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90"
                    >
                        <CheckCircle size={14} className="mr-1.5" /> Markera som hittad
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNotify(report)}
                    data-testid={`button-notify-${report.id}`}
                >
                    <Bell size={14} className="mr-1.5" /> Meddela ägare
                </Button>
                {report.status !== "closed" && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onUpdate(report, { status: "closed" })}
                        data-testid={`button-close-${report.id}`}
                    >
                        Avsluta
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => onDelete(report)}
                    data-testid={`button-delete-missing-${report.id}`}
                >
                    <Trash size={14} />
                </Button>
            </div>
        </div>
    );
}

export default function AdminMissingBirds() {
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState("searching");
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);
    const [notifyDialog, setNotifyDialog] = useState(null);
    const [notifyMessage, setNotifyMessage] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(null);
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (status !== "all") params.status = status;
            if (q) params.search = q;
            const { data } = await api.get("/admin/missing-birds", { params });
            setItems(data);
            bulk.clear();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
    }, [status, q]);

    const updateStatus = async (report, updates) => {
        try {
            await api.patch(`/admin/missing-birds/${report.id}`, updates);
            toast.success(updates.status === "found" ? "Markerad som hittad" : "Uppdaterad");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const submitNotify = async () => {
        try {
            await api.post(`/admin/missing-birds/${notifyDialog.id}/notify`, {
                message: notifyMessage.trim() || null,
            });
            toast.success(`Meddelande sparat. Ring ${notifyDialog.contact_phone}`);
            setNotifyDialog(null);
            setNotifyMessage("");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/missing-birds/${confirmDelete.id}`);
            toast.success("Rapport borttagen");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const openNotify = (report) => {
        setNotifyDialog(report);
        setNotifyMessage(
            report.status === "found"
                ? `Hej ${report.owner_name}! Din ${report.species} har hittats. Ring oss på 0768 48 80 91 så pratar vi ihop oss.`
                : `Hej ${report.owner_name}! Vi har fått en ledtråd om din ${report.species}. Vi hör av oss inom kort.`,
        );
    };

    const runBulk = async (action) => {
        try {
            const { data } = await api.post("/admin/missing-birds/bulk", {
                ids: bulk.selectedIds,
                action,
            });
            const n = data.deleted ?? data.updated ?? bulk.selectedIds.length;
            const label =
                action === "delete"
                    ? "borttagna"
                    : action === "found"
                      ? "markerade som hittade"
                      : "avslutade";
            toast.success(`${n} rapport(er) ${label}.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Privat register</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Bortflögna fåglar
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} rapport{items.length !== 1 ? "er" : ""} · syns endast för admin
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() =>
                        window.open(`${API}/admin/missing-birds/export/csv`, "_blank")
                    }
                    data-testid="button-export-missing-csv"
                >
                    <DownloadSimple size={16} className="mr-2" /> Exportera CSV
                </Button>
            </div>

            <Tabs value={status} onValueChange={setStatus} className="mb-6">
                <TabsList data-testid="missing-status-tabs">
                    <TabsTrigger value="searching" data-testid="tab-searching">
                        Sökes
                    </TabsTrigger>
                    <TabsTrigger value="found" data-testid="tab-found">
                        Hittade
                    </TabsTrigger>
                    <TabsTrigger value="closed" data-testid="tab-closed">
                        Avslutade
                    </TabsTrigger>
                    <TabsTrigger value="all" data-testid="tab-all">
                        Alla
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="surface p-4 mb-6 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[240px]">
                    <MagnifyingGlass
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        className="pl-9"
                        placeholder="Sök på ägare, art, ringnr, plats…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-missing"
                    />
                </div>
                {items.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                        <SelectAllCheckbox
                            allSelected={bulk.allSelected}
                            someSelected={bulk.someSelected}
                            onToggle={bulk.toggleAll}
                        />
                        <span className="text-muted-foreground">
                            Markera alla ({items.length})
                        </span>
                    </label>
                )}
            </div>

            {loading && (
                <div className="surface p-10 text-center text-muted-foreground">Laddar…</div>
            )}
            {!loading && items.length === 0 && (
                <div className="surface p-10 text-center text-muted-foreground">
                    <WarningCircle size={28} weight="duotone" className="mx-auto mb-2" />
                    Inga rapporter i denna kategori.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-24">
                {items.map((r) => (
                    <MissingCard
                        key={r.id}
                        report={r}
                        selected={bulk.isSelected(r.id)}
                        onToggleSelect={() => bulk.toggle(r.id)}
                        onUpdate={updateStatus}
                        onNotify={openNotify}
                        onDelete={setConfirmDelete}
                    />
                ))}
            </div>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="rapporter"
                actions={[
                    {
                        key: "found",
                        label: "Markera hittade",
                        icon: <CheckCircle size={14} />,
                        tone: "success",
                        confirm: `Markera ${bulk.count} rapport(er) som hittade?`,
                        onRun: () => runBulk("found"),
                    },
                    {
                        key: "closed",
                        label: "Avsluta",
                        icon: <CheckCircle size={14} />,
                        confirm: `Avsluta ${bulk.count} rapport(er)?`,
                        onRun: () => runBulk("closed"),
                    },
                    {
                        key: "delete",
                        label: "Ta bort",
                        icon: <Trash size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} rapport(er) tas bort permanent.`,
                        onRun: () => runBulk("delete"),
                    },
                ]}
            />

            <Dialog open={!!notifyDialog} onOpenChange={(v) => !v && setNotifyDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Meddela ägaren</DialogTitle>
                        <DialogDescription>
                            Ring {notifyDialog?.contact_phone} eller mejla{" "}
                            {notifyDialog?.contact_email || "—"}. Skriv en anteckning
                            om vad du meddelade så det finns sparat i systemet.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="msg">Meddelande / anteckning</Label>
                        <Textarea
                            id="msg"
                            rows={5}
                            value={notifyMessage}
                            onChange={(e) => setNotifyMessage(e.target.value)}
                            data-testid="input-notify-message"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNotifyDialog(null)}>
                            Avbryt
                        </Button>
                        <Button onClick={submitNotify} data-testid="button-submit-notify">
                            <Bell size={14} className="mr-2" /> Spara meddelande
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
                        <AlertDialogTitle>Ta bort rapport?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Rapporten om {confirmDelete?.species} från{" "}
                            {confirmDelete?.owner_name} tas bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-missing"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}
