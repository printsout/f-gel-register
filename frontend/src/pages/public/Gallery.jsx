import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
    ArrowLeft,
    ChatCircleText,
    User,
    Calendar,
    Camera,
    PaperPlaneTilt,
    Bird as BirdIcon,
    Image as ImageIcon,
} from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";

function formatDate(d) {
    if (!d) return "";
    try {
        return new Date(d).toLocaleDateString("sv-SE", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return String(d).slice(0, 10);
    }
}

function BirdPost({ bird }) {
    const [expanded, setExpanded] = useState(false);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ commenter_name: "", commenter_email: "", comment_text: "" });

    const loadComments = async () => {
        setLoadingComments(true);
        try {
            const { data } = await api.get(`/birds/${bird.id}/comments`);
            setComments(data);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoadingComments(false);
        }
    };

    const toggle = () => {
        const next = !expanded;
        setExpanded(next);
        if (next && comments.length === 0) loadComments();
    };

    const submit = async () => {
        if (!form.commenter_name.trim() || !form.comment_text.trim()) {
            toast.error("Namn och kommentar krävs.");
            return;
        }
        setBusy(true);
        try {
            await api.post(`/birds/${bird.id}/comments`, form);
            toast.success("Kommentar skickad!");
            setForm({ commenter_name: "", commenter_email: "", comment_text: "" });
            loadComments();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    const images = bird.image_urls || [];

    return (
        <article
            className={`surface p-5 fade-in ${expanded ? "lg:col-span-2" : ""}`}
            data-testid={`bird-post-${bird.id}`}
        >
            <header className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <h3 className="font-display text-xl font-bold truncate">
                        {bird.species}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <User size={12} />
                            {bird.owner_name}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                            <Calendar size={12} />
                            {bird.ring_number}
                        </span>
                        <span>{formatDate(bird.registration_date)}</span>
                    </div>
                </div>
                <Badge variant="outline" className="text-xs">
                    {images.length} foto{images.length !== 1 ? "n" : ""}
                </Badge>
            </header>

            {images.length > 0 ? (
                <div
                    className={`grid gap-2 mb-4 ${
                        expanded ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"
                    }`}
                >
                    {images.map((src, i) => (
                        <img
                            key={i}
                            src={src}
                            alt={`${bird.species} bild ${i + 1}`}
                            className={`w-full object-cover rounded-md border border-border ${
                                expanded ? "h-40" : "h-32"
                            }`}
                            loading="lazy"
                        />
                    ))}
                </div>
            ) : (
                <div className="border border-dashed border-border rounded-md p-6 mb-4 text-center text-muted-foreground">
                    <ImageIcon size={24} weight="duotone" className="mx-auto mb-1" />
                    <p className="text-xs">Inga bilder ännu</p>
                </div>
            )}

            {bird.additional_info && !expanded && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {bird.additional_info}
                </p>
            )}
            {bird.additional_info && expanded && (
                <p className="text-sm mb-3 whitespace-pre-wrap">
                    {bird.additional_info}
                </p>
            )}

            <Button
                variant="outline"
                size="sm"
                onClick={toggle}
                data-testid={`button-toggle-comments-${bird.id}`}
                className="w-full"
            >
                <ChatCircleText size={16} className="mr-2" />
                {expanded
                    ? "Dölj kommentarer"
                    : `Kommentera${comments.length ? ` (${comments.length})` : ""}`}
            </Button>

            {expanded && (
                <div className="mt-5 space-y-4 border-t border-border pt-4">
                    <div className="rounded-md bg-muted/50 p-4 space-y-3">
                        <p className="label-caps">Skriv en kommentar</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Input
                                placeholder="Ditt namn *"
                                value={form.commenter_name}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        commenter_name: e.target.value,
                                    })
                                }
                                data-testid={`input-comment-name-${bird.id}`}
                            />
                            <Input
                                placeholder="E-post (valfritt)"
                                type="email"
                                value={form.commenter_email}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        commenter_email: e.target.value,
                                    })
                                }
                                data-testid={`input-comment-email-${bird.id}`}
                            />
                        </div>
                        <Textarea
                            placeholder="Din kommentar…"
                            rows={3}
                            value={form.comment_text}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    comment_text: e.target.value,
                                })
                            }
                            data-testid={`input-comment-text-${bird.id}`}
                        />
                        <Button
                            onClick={submit}
                            disabled={busy}
                            data-testid={`button-submit-comment-${bird.id}`}
                        >
                            <PaperPlaneTilt size={16} className="mr-2" />
                            {busy ? "Skickar…" : "Skicka"}
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {loadingComments && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                Laddar kommentarer…
                            </p>
                        )}
                        {!loadingComments && comments.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                Inga kommentarer än. Bli först!
                            </p>
                        )}
                        {comments.map((c) => (
                            <div
                                key={c.id}
                                className="p-3 rounded-md bg-accent/40 text-sm"
                                data-testid={`gallery-comment-${c.id}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium">
                                        {c.commenter_name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDate(c.created_at)}
                                    </span>
                                </div>
                                <p>{c.comment_text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </article>
    );
}

export default function Gallery() {
    const { user } = useAuth();
    const [birds, setBirds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/public-birds");
                setBirds(data);
            } catch (e) {
                toast.error(formatApiError(e));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = q
        ? birds.filter(
              (b) =>
                  b.species?.toLowerCase().includes(q.toLowerCase()) ||
                  b.owner_name?.toLowerCase().includes(q.toLowerCase()) ||
                  b.ring_number?.toLowerCase().includes(q.toLowerCase()),
          )
        : birds;

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                        data-testid="link-back-home"
                    >
                        <ArrowLeft size={16} />
                        Tillbaka
                    </Link>
                    <span className="label-caps">Galleri</span>
                    {user ? (
                        <Link to="/mina-faglar">
                            <Button size="sm" variant="outline" data-testid="button-my-birds-nav">
                                Mina fåglar
                            </Button>
                        </Link>
                    ) : (
                        <div className="w-[100px]" />
                    )}
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-6 py-10">
                <div className="mb-8">
                    <p className="label-caps mb-2">Fågelinlägg</p>
                    <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight">
                        Papegojor från hela Sverige
                    </h1>
                    <p className="text-muted-foreground mt-2 max-w-xl">
                        Upptäck registrerade fåglar, se bilder och lämna en
                        hälsning till ägaren.
                    </p>
                </div>

                <div className="mb-6">
                    <Input
                        placeholder="Sök på art, ägare, ringnummer…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-gallery"
                        className="h-11"
                    />
                </div>

                {loading && (
                    <div className="surface p-10 text-center text-muted-foreground">
                        Laddar galleri…
                    </div>
                )}
                {!loading && filtered.length === 0 && (
                    <div className="surface p-10 text-center text-muted-foreground">
                        <BirdIcon
                            size={28}
                            weight="duotone"
                            className="mx-auto mb-2"
                        />
                        Inga fåglar matchar sökningen.
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((b) => (
                        <BirdPost key={b.id} bird={b} />
                    ))}
                </div>
            </div>
        </div>
    );
}
