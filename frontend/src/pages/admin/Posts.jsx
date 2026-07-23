import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    ClockCountdown,
    CheckCircle,
    XCircle,
    Trash,
    ImageSquare,
    User,
    Feather,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
    if (status === "approved")
        return (
            <Badge
                className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
                variant="outline"
            >
                <CheckCircle size={12} className="mr-1" /> Publicerad
            </Badge>
        );
    if (status === "rejected")
        return (
            <Badge
                className="bg-destructive/10 text-destructive border-destructive/30"
                variant="outline"
            >
                <XCircle size={12} className="mr-1" /> Avvisad
            </Badge>
        );
    return (
        <Badge
            className="bg-[hsl(var(--warning))]/15 text-yellow-700 border-yellow-500/40"
            variant="outline"
        >
            <ClockCountdown size={12} className="mr-1" /> Väntar
        </Badge>
    );
}

function PostCard({ post, onApprove, onReject, onDelete, selected, onToggleSelect }) {
    return (
        <div
            className={`surface p-5 fade-in relative ${selected ? "ring-2 ring-primary" : ""}`}
            data-testid={`admin-post-${post.id}`}
        >
            <div className="absolute top-4 left-4">
                <Checkbox
                    checked={selected}
                    onCheckedChange={onToggleSelect}
                    data-testid={`bulk-select-row-${post.id}`}
                    aria-label="Markera inlägg"
                />
            </div>
            <div className="flex items-start justify-between gap-3 mb-3 pl-8">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={post.status} />
                        <span className="text-xs text-muted-foreground">
                            {post.created_at?.slice(0, 10)}
                        </span>
                    </div>
                    <h3 className="font-display text-lg font-bold">{post.title}</h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <User size={12} /> {post.author_name} · {post.author_email}
                        </span>
                        {post.bird_species && (
                            <span className="flex items-center gap-1">
                                <Feather size={12} weight="duotone" /> {post.bird_species}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {post.image_urls?.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                    {post.image_urls.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noreferrer">
                            <img
                                src={src}
                                alt=""
                                className="w-full h-24 object-cover rounded-md border border-border hover:opacity-90"
                                loading="lazy"
                            />
                        </a>
                    ))}
                </div>
            )}

            <p className="text-sm whitespace-pre-wrap mb-4">{post.content}</p>

            {post.status === "rejected" && post.reject_reason && (
                <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2 mb-3">
                    <p className="text-xs text-destructive">
                        <strong>Avvisad:</strong> {post.reject_reason}
                    </p>
                </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end border-t border-border pt-3">
                {post.status !== "approved" && (
                    <Button
                        size="sm"
                        onClick={() => onApprove(post)}
                        data-testid={`button-approve-${post.id}`}
                        className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90"
                    >
                        <CheckCircle size={14} className="mr-1.5" /> Godkänn
                    </Button>
                )}
                {post.status !== "rejected" && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onReject(post)}
                        data-testid={`button-reject-${post.id}`}
                    >
                        <XCircle size={14} className="mr-1.5" /> Avvisa
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => onDelete(post)}
                    data-testid={`button-delete-post-${post.id}`}
                >
                    <Trash size={14} className="mr-1.5" /> Ta bort
                </Button>
            </div>
        </div>
    );
}

export default function AdminPosts() {
    const [status, setStatus] = useState("pending");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [rejecting, setRejecting] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [bulkReject, setBulkReject] = useState(false);
    const [bulkRejectReason, setBulkRejectReason] = useState("");
    const bulk = useBulkSelection(items);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/posts", {
                params: status === "all" ? {} : { status },
            });
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
    }, [status]);

    const approve = async (post) => {
        try {
            await api.post(`/admin/posts/${post.id}/approve`);
            toast.success("Inlägg godkänt och publicerat.");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const submitReject = async () => {
        try {
            await api.post(`/admin/posts/${rejecting.id}/reject`, {
                reason: rejectReason.trim() || null,
            });
            toast.success("Inlägg avvisat.");
            setRejecting(null);
            setRejectReason("");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/posts/${confirmDelete.id}`);
            toast.success("Inlägg borttaget.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const runBulk = async (action, extra = {}) => {
        try {
            const { data } = await api.post("/admin/posts/bulk", {
                ids: bulk.selectedIds,
                action,
                ...extra,
            });
            const n = data.deleted ?? data.updated ?? bulk.selectedIds.length;
            toast.success(`${n} inlägg ${action === "delete" ? "borttagna" : action === "approve" ? "godkända" : "avvisade"}.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const bulkActions = [
        {
            key: "approve",
            label: "Godkänn",
            icon: <CheckCircle size={14} />,
            tone: "success",
            confirm: `Godkänn ${bulk.count} inlägg och publicera dem i galleriet?`,
            onRun: () => runBulk("approve"),
        },
        {
            key: "reject",
            label: "Avvisa",
            icon: <XCircle size={14} />,
            confirm: null,
            onRun: () => setBulkReject(true),
        },
        {
            key: "delete",
            label: "Ta bort",
            icon: <Trash size={14} />,
            tone: "destructive",
            confirm: `${bulk.count} inlägg tas bort permanent.`,
            onRun: () => runBulk("delete"),
        },
    ];

    return (
        <AdminLayout>
            <div className="mb-8">
                <p className="label-caps mb-2">Community-moderering</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold">
                    Inlägg
                </h1>
                <p className="text-muted-foreground mt-1">
                    Granska community-inlägg innan de publiceras i galleriet.
                </p>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                <Tabs value={status} onValueChange={setStatus}>
                    <TabsList data-testid="posts-status-tabs">
                        <TabsTrigger value="pending" data-testid="tab-pending">
                            Väntande
                        </TabsTrigger>
                        <TabsTrigger value="approved" data-testid="tab-approved">
                            Publicerade
                        </TabsTrigger>
                        <TabsTrigger value="rejected" data-testid="tab-rejected">
                            Avvisade
                        </TabsTrigger>
                        <TabsTrigger value="all" data-testid="tab-all">
                            Alla
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
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
                    <ImageSquare size={28} weight="duotone" className="mx-auto mb-2" />
                    Inga inlägg i denna kategori.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-24">
                {items.map((p) => (
                    <PostCard
                        key={p.id}
                        post={p}
                        selected={bulk.isSelected(p.id)}
                        onToggleSelect={() => bulk.toggle(p.id)}
                        onApprove={approve}
                        onReject={(post) => {
                            setRejecting(post);
                            setRejectReason("");
                        }}
                        onDelete={setConfirmDelete}
                    />
                ))}
            </div>

            <BulkActionsBar
                count={bulk.count}
                onClear={bulk.clear}
                actions={bulkActions}
                entityName="inlägg"
            />

            <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Avvisa inlägg</DialogTitle>
                        <DialogDescription>
                            Ange en anledning som visas för användaren.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="reason">Anledning (valfritt)</Label>
                        <Textarea
                            id="reason"
                            rows={4}
                            placeholder="Ex. Innehållet är inte relaterat till papegojor."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            data-testid="input-reject-reason"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejecting(null)}>
                            Avbryt
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={submitReject}
                            data-testid="button-submit-reject"
                        >
                            Avvisa
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk reject dialog */}
            <Dialog open={bulkReject} onOpenChange={(v) => !v && setBulkReject(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Avvisa {bulk.count} inlägg</DialogTitle>
                        <DialogDescription>
                            Anledningen visas för alla berörda användare.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="bulk-reason">Anledning (valfritt)</Label>
                        <Textarea
                            id="bulk-reason"
                            rows={4}
                            value={bulkRejectReason}
                            onChange={(e) => setBulkRejectReason(e.target.value)}
                            data-testid="input-bulk-reject-reason"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkReject(false)}>
                            Avbryt
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                await runBulk("reject", { reason: bulkRejectReason.trim() || null });
                                setBulkReject(false);
                                setBulkRejectReason("");
                            }}
                            data-testid="button-bulk-reject-submit"
                        >
                            Avvisa {bulk.count}
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
                        <AlertDialogTitle>Ta bort inlägg?</AlertDialogTitle>
                        <AlertDialogDescription>
                            &quot;{confirmDelete?.title}&quot; tas bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-admin-post"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}
