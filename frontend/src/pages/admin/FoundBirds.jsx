import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MagnifyingGlass, Trash, DownloadSimple, MapPin } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { API, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function FoundBirds() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/found-birds", {
                params: q ? { search: q } : {},
            });
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
    }, [q]);

    const doDelete = async () => {
        try {
            await api.delete(`/admin/found-birds/${confirmDelete.id}`);
            toast.success("Rapport borttagen.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Rapporter</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Hittade fåglar
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} rapporter
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() =>
                        window.open(
                            `${API}/admin/found-birds/export/csv`,
                            "_blank",
                        )
                    }
                    data-testid="button-export-found-csv"
                >
                    <DownloadSimple size={16} className="mr-2" />
                    Exportera CSV
                </Button>
            </div>

            <div className="surface p-4 mb-6">
                <div className="relative">
                    <MagnifyingGlass
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        className="pl-9"
                        placeholder="Sök på plats, ringnr, beskrivning…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-found"
                    />
                </div>
            </div>

            <div className="surface overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Plats</TableHead>
                            <TableHead>Beskrivning</TableHead>
                            <TableHead>Ringnr</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Upphittare</TableHead>
                            <TableHead>Telefon</TableHead>
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
                                    <MapPin size={28} weight="duotone" className="mx-auto mb-2" />
                                    Inga rapporter matchar.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            items.map((b) => (
                                <TableRow
                                    key={b.id}
                                    data-testid={`row-found-${b.id}`}
                                >
                                    <TableCell className="font-medium">
                                        {b.location}
                                    </TableCell>
                                    <TableCell className="max-w-[280px] truncate text-muted-foreground text-sm">
                                        {b.description}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {b.ring_number || "—"}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {b.date_found}
                                    </TableCell>
                                    <TableCell>{b.finder_name}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {b.finder_phone}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => setConfirmDelete(b)}
                                            data-testid={`button-delete-found-${b.id}`}
                                        >
                                            <Trash size={16} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort rapport?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Rapporten om {confirmDelete?.location} tas bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-found"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}
