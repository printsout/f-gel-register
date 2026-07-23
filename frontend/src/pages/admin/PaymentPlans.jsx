import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    MagnifyingGlass,
    DownloadSimple,
    CurrencyCircleDollar,
    ArrowClockwise,
    XCircle,
    CheckCircle,
    Clock,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { API, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
    if (status === "active")
        return (
            <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" variant="outline">
                <CheckCircle size={11} className="mr-1" /> Aktiv
            </Badge>
        );
    if (status === "past_due")
        return (
            <Badge className="bg-destructive/10 text-destructive border-destructive/30" variant="outline">
                <Clock size={11} className="mr-1" /> Förfallen
            </Badge>
        );
    return <Badge variant="outline"><XCircle size={11} className="mr-1" /> Avslutad</Badge>;
}

export default function AdminPaymentPlans() {
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState("all");
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (status !== "all") params.status = status;
            if (q) params.search = q;
            const { data } = await api.get("/admin/payment-plans", { params });
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

    const renew = async (plan) => {
        try {
            await api.post(`/admin/payment-plans/${plan.id}/renew`);
            toast.success(`Förnyad — nästa förfallodag om 365 dagar`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doCancel = async () => {
        try {
            await api.post(`/admin/payment-plans/${confirmCancel.id}/cancel`);
            toast.success("Plan avslutad.");
            setConfirmCancel(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const runBulkCancel = async () => {
        try {
            const { data } = await api.post("/admin/payment-plans/bulk-cancel", {
                ids: bulk.selectedIds,
            });
            const n = data.updated ?? bulk.selectedIds.length;
            toast.success(`${n} betalningsplan(er) avslutade.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const totalActive = items.filter((p) => p.status === "active").length;
    const totalPastDue = items.filter((p) => p.status === "past_due").length;

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Prenumerationer</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Betalningsplaner
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} planer · {totalActive} aktiva · {totalPastDue} förfallna
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => window.open(`${API}/admin/payment-plans/export/csv`, "_blank")}
                    data-testid="button-export-plans-csv"
                >
                    <DownloadSimple size={16} className="mr-2" /> Exportera CSV
                </Button>
            </div>

            <Tabs value={status} onValueChange={setStatus} className="mb-6">
                <TabsList data-testid="plans-tabs">
                    <TabsTrigger value="all" data-testid="tab-all">Alla</TabsTrigger>
                    <TabsTrigger value="active" data-testid="tab-active">Aktiva</TabsTrigger>
                    <TabsTrigger value="past_due" data-testid="tab-past-due">Förfallna</TabsTrigger>
                    <TabsTrigger value="cancelled" data-testid="tab-cancelled">Avslutade</TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="surface p-4 mb-6">
                <div className="relative">
                    <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Sök på e-post eller ringnummer…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-plans"
                    />
                </div>
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
                            <TableHead>Ägare (e-post)</TableHead>
                            <TableHead>Ringnr</TableHead>
                            <TableHead>Startdatum</TableHead>
                            <TableHead>Nästa förfall</TableHead>
                            <TableHead>Årsavgift</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Åtgärder</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                    Laddar…
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && items.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                    <CurrencyCircleDollar size={28} weight="duotone" className="mx-auto mb-2" />
                                    Inga betalningsplaner ännu.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            items.map((p) => (
                                <TableRow
                                    key={p.id}
                                    data-testid={`plan-row-${p.id}`}
                                    data-state={bulk.isSelected(p.id) ? "selected" : undefined}
                                >
                                    <TableCell>
                                        <Checkbox
                                            checked={bulk.isSelected(p.id)}
                                            onCheckedChange={() => bulk.toggle(p.id)}
                                            data-testid={`bulk-select-row-${p.id}`}
                                        />
                                    </TableCell>
                                    <TableCell className="text-sm">{p.user_email || "—"}</TableCell>
                                    <TableCell className="font-mono text-xs">{p.ring_number}</TableCell>
                                    <TableCell className="text-sm">{p.start_date}</TableCell>
                                    <TableCell className="text-sm font-medium">{p.next_due_date}</TableCell>
                                    <TableCell className="font-mono text-sm">{p.annual_amount} kr</TableCell>
                                    <TableCell><StatusBadge status={p.status} /></TableCell>
                                    <TableCell className="text-right">
                                        {p.status !== "cancelled" && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => renew(p)}
                                                data-testid={`button-renew-${p.id}`}
                                                title="Registrera betalning (+365 dagar)"
                                            >
                                                <ArrowClockwise size={16} />
                                            </Button>
                                        )}
                                        {p.status !== "cancelled" && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive"
                                                onClick={() => setConfirmCancel(p)}
                                                data-testid={`button-cancel-${p.id}`}
                                                title="Avsluta plan"
                                            >
                                                <XCircle size={16} />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={!!confirmCancel} onOpenChange={(v) => !v && setConfirmCancel(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Avsluta betalningsplan?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Planen för {confirmCancel?.user_email} ({confirmCancel?.ring_number}) markeras
                            som avslutad. Ingen mer årsavgift debiteras.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Ångra</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doCancel}
                            data-testid="button-confirm-cancel-plan"
                        >
                            Avsluta
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="betalningsplaner"
                actions={[
                    {
                        key: "cancel",
                        label: "Avsluta",
                        icon: <XCircle size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} betalningsplan(er) markeras som avslutade. Ingen mer årsavgift debiteras.`,
                        onRun: runBulkCancel,
                    },
                ]}
            />
        </AdminLayout>
    );
}
