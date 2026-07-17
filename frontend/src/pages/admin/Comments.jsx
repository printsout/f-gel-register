import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChatCircleDots, Trash } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import BulkActionsBar, { SelectAllCheckbox } from "@/components/BulkActionsBar";
import { useBulkSelection } from "@/hooks/useBulkSelection";
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

export default function Comments() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/comments");
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

    const doDelete = async () => {
        try {
            await api.delete(`/admin/comments/${confirmDelete.id}`);
            toast.success("Borttagen.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const runBulkDelete = async () => {
        try {
            const { data } = await api.post("/admin/comments/bulk-delete", {
                ids: bulk.selectedIds,
            });
            toast.success(`${data.deleted} kommentar(er) borttagna.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="label-caps mb-2">Moderering</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Kommentarer
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} kommentarer
                    </p>
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
                <div className="surface p-10 text-center text-muted-foreground">
                    Laddar…
                </div>
            )}
            {!loading && items.length === 0 && (
                <div className="surface p-10 text-center text-muted-foreground">
                    <ChatCircleDots
                        size={28}
                        weight="duotone"
                        className="mx-auto mb-2"
                    />
                    Inga kommentarer.
                </div>
            )}

            <div className="space-y-3 pb-24">
                {items.map((c) => (
                    <div
                        key={c.id}
                        className={`surface p-4 flex items-start gap-4 fade-in ${bulk.isSelected(c.id) ? "ring-2 ring-primary" : ""}`}
                        data-testid={`comment-${c.id}`}
                    >
                        <Checkbox
                            checked={bulk.isSelected(c.id)}
                            onCheckedChange={() => bulk.toggle(c.id)}
                            className="mt-2"
                            data-testid={`bulk-select-row-${c.id}`}
                        />
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-display font-bold text-white"
                            style={{ background: "hsl(var(--primary))" }}
                        >
                            {c.commenter_name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 text-sm">
                                <span className="font-medium">
                                    {c.commenter_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {c.created_at?.slice(0, 10)}
                                </span>
                                {c.commenter_email && (
                                    <span className="text-xs text-muted-foreground">
                                        {c.commenter_email}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm mt-1">{c.comment_text}</p>
                            <p className="text-xs text-muted-foreground mt-2 font-mono">
                                Fågel-ID: {c.bird_id}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setConfirmDelete(c)}
                            data-testid={`button-delete-comment-${c.id}`}
                        >
                            <Trash size={16} />
                        </Button>
                    </div>
                ))}
            </div>

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort kommentar?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Kommentaren tas bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-comment"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                entityName="kommentarer"
                actions={[
                    {
                        key: "delete",
                        label: "Ta bort",
                        icon: <Trash size={14} />,
                        tone: "destructive",
                        confirm: `${bulk.count} kommentar(er) tas bort permanent.`,
                        onRun: runBulkDelete,
                    },
                ]}
            />
        </AdminLayout>
    );
}
