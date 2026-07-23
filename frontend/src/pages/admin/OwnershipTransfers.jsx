import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    ArrowsClockwise,
    CheckCircle,
    XCircle,
    Bird as BirdIcon,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const STATUS_BADGE = {
    pending: { label: "Väntande", cls: "bg-amber-100 text-amber-900" },
    approved: { label: "Godkänd", cls: "bg-green-100 text-green-900" },
    rejected: { label: "Avslagen", cls: "bg-red-100 text-red-900" },
};

export default function OwnershipTransfersAdmin() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("all");
    const [viewing, setViewing] = useState(null);
    const [decision, setDecision] = useState({ mode: null, reason: "" });
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const params = statusFilter === "all" ? {} : { status: statusFilter };
            const { data } = await api.get("/admin/ownership-transfers", { params });
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const runDecision = async () => {
        if (!viewing || !decision.mode) return;
        setBusy(true);
        try {
            const path = `/admin/ownership-transfers/${viewing.id}/${decision.mode}`;
            await api.post(path, { reason: decision.reason || null });
            toast.success(decision.mode === "approve" ? "Ägarbyte godkänt." : "Ägarbyte avslaget.");
            setViewing(null);
            setDecision({ mode: null, reason: "" });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Registret</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold flex items-center gap-3">
                        <ArrowsClockwise size={30} weight="duotone" className="text-primary" />
                        Ägarbyten
                    </h1>
                    <p className="text-muted-foreground mt-1">{items.length} begäran</p>
                </div>
                <div className="min-w-[180px]">
                    <Label className="label-caps">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="mt-1" data-testid="filter-status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alla</SelectItem>
                            <SelectItem value="pending">Väntande</SelectItem>
                            <SelectItem value="approved">Godkända</SelectItem>
                            <SelectItem value="rejected">Avslagna</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="surface overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fågel</TableHead>
                            <TableHead>Nuvarande ägare</TableHead>
                            <TableHead>Ny ägare</TableHead>
                            <TableHead>Skapad</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Åtgärd</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                    Laddar…
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && items.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                    <BirdIcon size={28} weight="duotone" className="mx-auto mb-2" />
                                    Inga ägarbyten just nu.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            items.map((t) => (
                                <TableRow key={t.id} data-testid={`row-transfer-${t.id}`}>
                                    <TableCell>
                                        <div className="font-medium">{t.species}</div>
                                        <div className="text-xs text-muted-foreground font-mono">
                                            {t.ring_number}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">{t.from_owner_name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t.from_owner_email}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">{t.to_owner_name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t.to_owner_email}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {new Date(t.created_at).toLocaleDateString("sv-SE")}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            className={
                                                STATUS_BADGE[t.status]?.cls || ""
                                            }
                                        >
                                            {STATUS_BADGE[t.status]?.label || t.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setViewing(t)}
                                            data-testid={`btn-view-${t.id}`}
                                        >
                                            Visa
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            Ägarbyte — {viewing?.species} ({viewing?.ring_number})
                        </DialogTitle>
                        <DialogDescription>
                            Granska uppgifterna och godkänn eller avslå.
                        </DialogDescription>
                    </DialogHeader>
                    {viewing && (
                        <div className="space-y-5 text-sm">
                            <div className="grid sm:grid-cols-2 gap-4">
                                <Section title="Nuvarande ägare">
                                    <KV label="Namn" value={viewing.from_owner_name} />
                                    <KV label="E-post" value={viewing.from_owner_email} />
                                    <KV label="Telefon" value={viewing.from_owner_phone} />
                                    <KV label="Adress" value={viewing.from_owner_address} />
                                </Section>
                                <Section title="Ny ägare">
                                    <KV label="Namn" value={viewing.to_owner_name} />
                                    <KV label="E-post" value={viewing.to_owner_email} />
                                    <KV label="Telefon" value={viewing.to_owner_phone} />
                                    <KV label="Adress" value={viewing.to_owner_address} />
                                </Section>
                            </div>
                            {viewing.note && (
                                <Section title="Meddelande">
                                    <p>{viewing.note}</p>
                                </Section>
                            )}
                            {viewing.status !== "pending" ? (
                                <div className="rounded-md border border-border bg-muted/40 p-3">
                                    <p className="text-xs text-muted-foreground">
                                        Beslut fattat {viewing.decided_at
                                            ? new Date(viewing.decided_at).toLocaleString("sv-SE")
                                            : "—"}
                                    </p>
                                    {viewing.admin_notes && (
                                        <p className="mt-1">
                                            <strong>Motivering:</strong> {viewing.admin_notes}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <Label>Motivering (visas i e-post vid avslag)</Label>
                                    <Textarea
                                        rows={3}
                                        value={decision.reason}
                                        onChange={(e) =>
                                            setDecision({
                                                ...decision,
                                                reason: e.target.value,
                                            })
                                        }
                                        data-testid="input-decision-reason"
                                        placeholder="Valfritt vid godkännande, rekommenderat vid avslag."
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    {viewing?.status === "pending" && (
                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDecision({ ...decision, mode: "reject" });
                                    runDecision();
                                }}
                                disabled={busy}
                                data-testid="btn-reject"
                            >
                                <XCircle size={16} className="mr-2" /> Avslå
                            </Button>
                            <Button
                                onClick={() => {
                                    setDecision({ ...decision, mode: "approve" });
                                    runDecision();
                                }}
                                disabled={busy}
                                data-testid="btn-approve"
                            >
                                <CheckCircle size={16} className="mr-2" /> Godkänn
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}

function Section({ title, children }) {
    return (
        <div className="border border-border rounded-md p-3">
            <p className="label-caps mb-2">{title}</p>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function KV({ label, value }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="text-right">{value || "—"}</span>
        </div>
    );
}
