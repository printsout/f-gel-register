import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ListChecks } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

const ACTION_LABELS = {
    "user.register": { label: "Konto skapat", tone: "success" },
    "user.login": { label: "Inloggning", tone: "info" },
    "user.google_login": { label: "Google-inloggning", tone: "info" },
    "admin.user.update": { label: "Uppdaterade användare", tone: "default" },
    "admin.user.block": { label: "Blockerade användare", tone: "warning" },
    "admin.user.unblock": { label: "Avblockerade användare", tone: "success" },
    "admin.user.delete": { label: "Tog bort användare", tone: "danger" },
    "admin.bird.update": { label: "Uppdaterade fågel", tone: "default" },
    "admin.bird.delete": { label: "Tog bort fågel", tone: "danger" },
    "admin.found_bird.delete": { label: "Tog bort fyndrapport", tone: "danger" },
    "admin.discount.create": { label: "Skapade rabattkod", tone: "success" },
    "admin.discount.update": { label: "Uppdaterade rabattkod", tone: "default" },
    "admin.discount.delete": { label: "Tog bort rabattkod", tone: "danger" },
    "admin.feedback.delete": { label: "Tog bort feedback", tone: "danger" },
    "admin.comment.delete": { label: "Tog bort kommentar", tone: "danger" },
};

function toneClass(tone) {
    return tone === "success"
        ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
        : tone === "warning"
          ? "bg-[hsl(var(--warning))]/15 text-yellow-700 border-yellow-500/40"
          : tone === "danger"
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : tone === "info"
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-secondary text-secondary-foreground border-border";
}

export default function Activity() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/admin/activity");
                setItems(data);
            } catch (e) {
                toast.error(formatApiError(e));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <AdminLayout>
            <div className="mb-8">
                <p className="label-caps mb-2">Historik</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold">
                    Aktivitetslogg
                </h1>
                <p className="text-muted-foreground mt-1">
                    Senaste händelser i systemet
                </p>
            </div>

            {loading && (
                <div className="surface p-10 text-center text-muted-foreground">
                    Laddar…
                </div>
            )}
            {!loading && items.length === 0 && (
                <div className="surface p-10 text-center text-muted-foreground">
                    <ListChecks
                        size={28}
                        weight="duotone"
                        className="mx-auto mb-2"
                    />
                    Ingen aktivitet ännu.
                </div>
            )}

            <div className="surface divide-y divide-border">
                {items.map((a) => {
                    const meta = ACTION_LABELS[a.action] || {
                        label: a.action,
                        tone: "default",
                    };
                    return (
                        <div
                            key={a.id}
                            className="p-4 flex items-center gap-4 fade-in"
                            data-testid={`activity-${a.id}`}
                        >
                            <div className="flex-shrink-0">
                                <Badge
                                    variant="outline"
                                    className={toneClass(meta.tone)}
                                >
                                    {meta.label}
                                </Badge>
                            </div>
                            <div className="flex-1 min-w-0 text-sm">
                                <p className="truncate">
                                    <span className="font-medium">
                                        {a.actor_email || "system"}
                                    </span>{" "}
                                    <span className="text-muted-foreground">
                                        · mål: <span className="font-mono text-xs">{a.target}</span>
                                    </span>
                                </p>
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {a.created_at
                                    ? new Date(a.created_at).toLocaleString("sv-SE")
                                    : ""}
                            </span>
                        </div>
                    );
                })}
            </div>
        </AdminLayout>
    );
}
