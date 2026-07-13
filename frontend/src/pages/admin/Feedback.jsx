import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Star, Trash, DownloadSimple } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { API, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
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

function Stars({ n }) {
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <Star
                    key={i}
                    size={16}
                    weight={i <= n ? "fill" : "regular"}
                    className={i <= n ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}
                />
            ))}
        </div>
    );
}

export default function Feedback() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/feedback");
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
    }, []);

    const doDelete = async () => {
        try {
            await api.delete(`/admin/feedback/${confirmDelete.id}`);
            toast.success("Borttagen.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const avg = items.length
        ? (items.reduce((s, i) => s + i.rating, 0) / items.length).toFixed(1)
        : "—";

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Kundnöjdhet</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Feedback
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} inlägg · snittbetyg <strong>{avg}</strong> / 5
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() =>
                        window.open(
                            `${API}/admin/feedback/export/csv`,
                            "_blank",
                        )
                    }
                    data-testid="button-export-feedback-csv"
                >
                    <DownloadSimple size={16} className="mr-2" />
                    Exportera CSV
                </Button>
            </div>

            {loading && (
                <div className="surface p-10 text-center text-muted-foreground">
                    Laddar…
                </div>
            )}
            {!loading && items.length === 0 && (
                <div className="surface p-10 text-center text-muted-foreground">
                    <Star size={28} weight="duotone" className="mx-auto mb-2" />
                    Ingen feedback än.
                </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
                {items.map((f) => (
                    <div
                        key={f.id}
                        className="surface p-5 fade-in"
                        data-testid={`feedback-${f.id}`}
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <Stars n={f.rating} />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setConfirmDelete(f)}
                                data-testid={`button-delete-feedback-${f.id}`}
                            >
                                <Trash size={16} />
                            </Button>
                        </div>
                        {f.comment ? (
                            <p className="text-sm leading-relaxed">{f.comment}</p>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">
                                (Ingen kommentar)
                            </p>
                        )}
                        <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
                            <span>{f.email || "anonym"}</span>
                            <Badge variant="outline">
                                {f.created_at?.slice(0, 10)}
                            </Badge>
                        </div>
                    </div>
                ))}
            </div>

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort feedback?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Detta är permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-feedback"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}
