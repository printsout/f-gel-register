import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    EnvelopeSimple,
    Trash,
    CheckCircle,
    ArrowClockwise,
    Phone,
    User,
    Clock,
    ArrowUUpLeft,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
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

const STATUS_META = {
    new: { label: "Ny", tone: "bg-primary/10 text-primary border-primary/30" },
    read: { label: "Läst", tone: "bg-muted text-muted-foreground border-border" },
    responded: { label: "Besvarad", tone: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" },
    archived: { label: "Arkiverad", tone: "bg-muted-foreground/10 text-muted-foreground border-border" },
};

function StatusBadge({ status }) {
    const s = STATUS_META[status] || STATUS_META.new;
    return (
        <Badge variant="outline" className={s.tone}>
            {s.label}
        </Badge>
    );
}

export default function AdminContactMessages() {
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState("all");
    const [loading, setLoading] = useState(true);
    const [openMsg, setOpenMsg] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/contact-messages");
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

    const filtered = status === "all" ? items : items.filter((m) => m.status === status);

    const updateStatus = async (msg, newStatus) => {
        try {
            await api.patch(`/admin/contact-messages/${msg.id}`, { status: newStatus });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/contact-messages/${confirmDelete.id}`);
            toast.success("Meddelande borttaget.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const runBulkDelete = async () => {
        try {
            const { data } = await api.post("/admin/contact-messages/bulk-delete", {
                ids: bulk.selectedIds,
            });
            toast.success(`${data.deleted} meddelande(n) borttagna.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const openMessage = async (msg) => {
        setOpenMsg(msg);
        if (msg.status === "new") {
            await updateStatus(msg, "read");
        }
    };

    const counts = {
        all: items.length,
        new: items.filter((m) => m.status === "new").length,
        read: items.filter((m) => m.status === "read").length,
        responded: items.filter((m) => m.status === "responded").length,
        archived: items.filter((m) => m.status === "archived").length,
    };

    return (
        <AdminLayout>
            <div className="mb-8">
                <p className="label-caps mb-2">Kontakt</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold">
                    Meddelanden
                </h1>
                <p className="text-muted-foreground mt-1">
                    {counts.new > 0
                        ? `${counts.new} olästa av ${counts.all} totalt`
                        : `${counts.all} meddelanden totalt`}
                </p>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                <Tabs value={status} onValueChange={setStatus}>
                    <TabsList data-testid="messages-status-tabs">
                        <TabsTrigger value="all">Alla ({counts.all})</TabsTrigger>
                        <TabsTrigger value="new" data-testid="tab-new">
                            Nya ({counts.new})
                        </TabsTrigger>
                        <TabsTrigger value="read">Lästa ({counts.read})</TabsTrigger>
                        <TabsTrigger value="responded">
                            Besvarade ({counts.responded})
                        </TabsTrigger>
                        <TabsTrigger value="archived">
                            Arkiverade ({counts.archived})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex items-center gap-3">
                    {filtered.length > 0 && (
                        <label className="flex items-center gap-2 text-sm">
                            <SelectAllCheckbox
                                allSelected={bulk.allSelected}
                                someSelected={bulk.someSelected}
                                onToggle={bulk.toggleAll}
                            />
                            <span className="text-muted-foreground">
                                Markera alla ({filtered.length})
                            </span>
                        </label>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={load}
                        data-testid="button-refresh"
                    >
                        <ArrowClockwise size={14} className="mr-1.5" />
                        Uppdatera
                    </Button>
                </div>
            </div>

            {loading && (
                <div className="surface p-10 text-center text-muted-foreground">
                    Laddar…
                </div>
            )}
            {!loading && filtered.length === 0 && (
                <div className="surface p-10 text-center text-muted-foreground">
                    <EnvelopeSimple
                        size={28}
                        weight="duotone"
                        className="mx-auto mb-2"
                    />
                    Inga meddelanden i denna kategori.
                </div>
            )}

            <div className="space-y-3 pb-24">
                {filtered.map((m) => (
                    <div
                        key={m.id}
                        className={`surface p-4 flex items-start gap-4 fade-in cursor-pointer hover:bg-muted/30 transition-colors ${bulk.isSelected(m.id) ? "ring-2 ring-primary" : ""} ${m.status === "new" ? "border-l-4 border-l-primary" : ""}`}
                        data-testid={`message-${m.id}`}
                    >
                        <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                                checked={bulk.isSelected(m.id)}
                                onCheckedChange={() => bulk.toggle(m.id)}
                                className="mt-1"
                                data-testid={`bulk-select-row-${m.id}`}
                            />
                        </div>
                        <div
                            className="flex-1 min-w-0"
                            onClick={() => openMessage(m)}
                        >
                            <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <StatusBadge status={m.status} />
                                    <span className="font-display font-semibold">
                                        {m.subject}
                                    </span>
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                                    <Clock size={12} />
                                    {m.created_at?.slice(0, 16).replace("T", " ")}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
                                <span className="flex items-center gap-1">
                                    <User size={12} /> {m.name}
                                </span>
                                <a
                                    href={`mailto:${m.email}`}
                                    className="flex items-center gap-1 hover:text-primary"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <EnvelopeSimple size={12} /> {m.email}
                                </a>
                                {m.phone && (
                                    <a
                                        href={`tel:${m.phone}`}
                                        className="flex items-center gap-1 hover:text-primary"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Phone size={12} /> {m.phone}
                                    </a>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {m.message}
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive h-8 px-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(m);
                                }}
                                data-testid={`button-delete-${m.id}`}
                            >
                                <Trash size={14} />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Detail dialog */}
            <Dialog open={!!openMsg} onOpenChange={(v) => !v && setOpenMsg(null)}>
                <DialogContent className="max-w-2xl">
                    {openMsg && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 flex-wrap">
                                    <StatusBadge status={openMsg.status} />
                                    <span>{openMsg.subject}</span>
                                </DialogTitle>
                                <DialogDescription>
                                    Från <strong>{openMsg.name}</strong> ·{" "}
                                    {openMsg.created_at?.slice(0, 16).replace("T", " ")}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid sm:grid-cols-2 gap-3 text-sm py-2 border-t border-b border-border">
                                <a
                                    href={`mailto:${openMsg.email}?subject=Re: ${encodeURIComponent(openMsg.subject)}`}
                                    className="flex items-center gap-2 hover:text-primary"
                                >
                                    <EnvelopeSimple size={16} weight="duotone" />
                                    <span className="truncate">{openMsg.email}</span>
                                </a>
                                {openMsg.phone && (
                                    <a
                                        href={`tel:${openMsg.phone}`}
                                        className="flex items-center gap-2 hover:text-primary"
                                    >
                                        <Phone size={16} weight="duotone" />
                                        {openMsg.phone}
                                    </a>
                                )}
                            </div>
                            <div
                                className="text-sm whitespace-pre-wrap py-3 max-h-[40vh] overflow-y-auto"
                                data-testid="message-detail-body"
                            >
                                {openMsg.message}
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-border">
                                {openMsg.status !== "responded" && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            updateStatus(openMsg, "responded").then(() =>
                                                setOpenMsg(null),
                                            )
                                        }
                                        data-testid="button-mark-responded"
                                    >
                                        <CheckCircle size={14} className="mr-1.5" />
                                        Markera besvarad
                                    </Button>
                                )}
                                {openMsg.status !== "archived" && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            updateStatus(openMsg, "archived").then(() =>
                                                setOpenMsg(null),
                                            )
                                        }
                                        data-testid="button-archive"
                                    >
                                        <ArrowUUpLeft size={14} className="mr-1.5" />
                                        Arkivera
                                    </Button>
                                )}
                                <a
                                    href={`mailto:${openMsg.email}?subject=Re: ${encodeURIComponent(openMsg.subject)}`}
                                >
                                    <Button size="sm" data-testid="button-reply">
                                        <EnvelopeSimple size={14} className="mr-1.5" />
                                        Svara via e-post
                                    </Button>
                                </a>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort meddelande?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Meddelandet från {confirmDelete?.name} tas bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-message"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="meddelanden"
                actions={[
                    {
                        key: "delete",
                        label: "Ta bort",
                        icon: <Trash size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} meddelande(n) tas bort permanent.`,
                        onRun: runBulkDelete,
                    },
                ]}
            />
        </AdminLayout>
    );
}
