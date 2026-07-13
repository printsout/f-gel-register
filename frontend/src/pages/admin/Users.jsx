import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    MagnifyingGlass,
    Shield,
    ShieldSlash,
    Trash,
    DownloadSimple,
    UsersThree,
    Eye,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { API, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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

export default function Users() {
    const { user: me } = useAuth();
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const [role, setRole] = useState("all");
    const [blocked, setBlocked] = useState("all");
    const [detail, setDetail] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (q) params.search = q;
            if (role !== "all") params.role = role;
            if (blocked !== "all") params.is_blocked = blocked === "yes";
            const { data } = await api.get("/admin/users", { params });
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
    }, [q, role, blocked]);

    const openDetail = async (u) => {
        try {
            const { data } = await api.get(`/admin/users/${u.user_id}`);
            setDetail(data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const toggleBlock = async (u) => {
        try {
            const endpoint = u.is_blocked ? "unblock" : "block";
            await api.put(`/admin/users/${u.user_id}/${endpoint}`);
            toast.success(u.is_blocked ? "Avblockerad" : "Blockerad");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const changeRole = async (u, newRole) => {
        try {
            await api.patch(`/admin/users/${u.user_id}`, { role: newRole });
            toast.success("Roll uppdaterad");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/admin/users/${confirmDelete.user_id}`);
            toast.success("Användare borttagen");
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
                    <p className="label-caps mb-2">Konton</p>
                    <h1 className="text-3xl md:text-4xl font-display font-bold">
                        Användare
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {items.length} användare
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() =>
                        window.open(`${API}/admin/users/export/csv`, "_blank")
                    }
                    data-testid="button-export-users-csv"
                >
                    <DownloadSimple size={16} className="mr-2" />
                    Exportera CSV
                </Button>
            </div>

            <div className="surface p-4 mb-6 flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[240px]">
                    <MagnifyingGlass
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        className="pl-9"
                        placeholder="Sök e-post eller namn…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-users"
                    />
                </div>
                <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="w-[160px]" data-testid="select-role">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alla roller</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">Användare</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={blocked} onValueChange={setBlocked}>
                    <SelectTrigger className="w-[160px]" data-testid="select-blocked">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alla statusar</SelectItem>
                        <SelectItem value="no">Aktiva</SelectItem>
                        <SelectItem value="yes">Blockerade</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="surface overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Namn</TableHead>
                            <TableHead>E-post</TableHead>
                            <TableHead>Roll</TableHead>
                            <TableHead>Fåglar</TableHead>
                            <TableHead>Metod</TableHead>
                            <TableHead>Status</TableHead>
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
                                    <UsersThree
                                        size={28}
                                        weight="duotone"
                                        className="mx-auto mb-2"
                                    />
                                    Inga användare matchar.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            items.map((u) => (
                                <TableRow
                                    key={u.user_id}
                                    data-testid={`row-user-${u.user_id}`}
                                >
                                    <TableCell className="font-medium">
                                        {u.first_name || u.last_name
                                            ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
                                            : "—"}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {u.email}
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={u.role}
                                            onValueChange={(v) => changeRole(u, v)}
                                            disabled={u.user_id === me.user_id}
                                        >
                                            <SelectTrigger className="w-[110px] h-8" data-testid={`select-role-${u.user_id}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="user">Användare</SelectItem>
                                                <SelectItem value="admin">Admin</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{u.bird_count}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {u.auth_provider || "password"}
                                    </TableCell>
                                    <TableCell>
                                        {u.is_blocked ? (
                                            <Badge className="bg-destructive/10 text-destructive border-destructive/30" variant="outline">
                                                Blockerad
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" variant="outline">
                                                Aktiv
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openDetail(u)}
                                            data-testid={`button-view-user-${u.user_id}`}
                                        >
                                            <Eye size={16} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => toggleBlock(u)}
                                            disabled={u.user_id === me.user_id}
                                            data-testid={`button-toggle-block-${u.user_id}`}
                                            className={u.is_blocked ? "text-[hsl(var(--success))]" : "text-yellow-700"}
                                        >
                                            {u.is_blocked ? <ShieldSlash size={16} /> : <Shield size={16} />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => setConfirmDelete(u)}
                                            disabled={u.user_id === me.user_id}
                                            data-testid={`button-delete-user-${u.user_id}`}
                                        >
                                            <Trash size={16} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Användardetaljer</DialogTitle>
                    </DialogHeader>
                    {detail && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="label-caps mb-1">Namn</p>
                                    <p>{`${detail.first_name || ""} ${detail.last_name || ""}`.trim() || "—"}</p>
                                </div>
                                <div>
                                    <p className="label-caps mb-1">E-post</p>
                                    <p>{detail.email}</p>
                                </div>
                                <div>
                                    <p className="label-caps mb-1">Roll</p>
                                    <p>{detail.role}</p>
                                </div>
                                <div>
                                    <p className="label-caps mb-1">Skapad</p>
                                    <p>{detail.created_at?.slice(0, 10)}</p>
                                </div>
                            </div>
                            <div>
                                <p className="label-caps mb-2">
                                    Registrerade fåglar ({detail.registered_birds?.length || 0})
                                </p>
                                {detail.registered_birds?.length === 0 && (
                                    <p className="text-sm text-muted-foreground">Inga fåglar</p>
                                )}
                                {detail.registered_birds?.map((b) => (
                                    <div key={b.id} className="border-t border-border py-2 flex justify-between text-sm">
                                        <span>
                                            {b.species}{" "}
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {b.ring_number}
                                            </span>
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {b.payment_status} · {b.registration_date}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort användare?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDelete?.email} tas bort permanent. Deras
                            fåglar behålls men kopplas loss.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-user"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}
