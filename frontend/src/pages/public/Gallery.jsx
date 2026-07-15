import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
    ArrowLeft,
    ChatCircleText,
    User,
    Calendar,
    PaperPlaneTilt,
    Image as ImageIcon,
    Feather,
    PlusCircle,
    ShieldCheck,
} from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import PublicFooter from "@/components/PublicFooter";

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

function PostCard({ post }) {
    const [expanded, setExpanded] = useState(false);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ commenter_name: "", commenter_email: "", comment_text: "" });

    // Comments are attached to the bird_id if present, else fallback to post.id key
    const commentsKey = post.bird_id || post.id;

    const loadComments = async () => {
        if (!post.bird_id) {
            setComments([]);
            return;
        }
        setLoadingComments(true);
        try {
            const { data } = await api.get(`/birds/${post.bird_id}/comments`);
            setComments(data);
        } catch (e) {
            // silent
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
        if (!post.bird_id) {
            toast.error("Kommentarer är inte tillgängliga för detta inlägg.");
            return;
        }
        if (!form.commenter_name.trim() || !form.comment_text.trim()) {
            toast.error("Namn och kommentar krävs.");
            return;
        }
        setBusy(true);
        try {
            const payload = {
                commenter_name: form.commenter_name.trim(),
                comment_text: form.comment_text.trim(),
            };
            const email = form.commenter_email.trim();
            if (email) payload.commenter_email = email;
            await api.post(`/birds/${post.bird_id}/comments`, payload);
            toast.success("Kommentar publicerad!");
            setForm({ commenter_name: "", commenter_email: "", comment_text: "" });
            loadComments();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    const images = post.image_urls || [];

    return (
        <article
            className={`surface p-5 fade-in ${expanded ? "lg:col-span-2" : ""}`}
            data-testid={`post-${post.id}`}
        >
            <header className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <h3 className="font-display text-xl font-bold">
                        {post.title}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <User size={12} /> {post.author_name}
                        </span>
                        {post.bird_species && (
                            <span className="flex items-center gap-1">
                                <Feather size={12} weight="duotone" /> {post.bird_species}
                            </span>
                        )}
                        <span className="flex items-center gap-1">
                            <Calendar size={12} /> {formatDate(post.moderated_at || post.created_at)}
                        </span>
                    </div>
                </div>
                <Badge variant="outline" className="text-xs">
                    {images.length} foto{images.length !== 1 ? "n" : ""}
                </Badge>
            </header>

            {images.length > 0 ? (
                <div className={`grid gap-2 mb-4 ${expanded ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                    {images.map((src, i) => (
                        <img
                            key={i}
                            src={src}
                            alt={`${post.title} bild ${i + 1}`}
                            className={`w-full object-cover rounded-md border border-border ${expanded ? "h-40" : "h-32"}`}
                            loading="lazy"
                        />
                    ))}
                </div>
            ) : null}

            <p className={`text-sm mb-4 whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}>
                {post.content}
            </p>

            <Button
                variant="outline"
                size="sm"
                onClick={toggle}
                data-testid={`button-toggle-${post.id}`}
                className="w-full"
            >
                <ChatCircleText size={16} className="mr-2" />
                {expanded ? "Dölj" : post.bird_id ? `Kommentera${comments.length ? ` (${comments.length})` : ""}` : "Läs mer"}
            </Button>

            {expanded && post.bird_id && (
                <div className="mt-5 space-y-4 border-t border-border pt-4">
                    <div className="rounded-md bg-muted/50 p-4 space-y-3">
                        <p className="label-caps">Skriv en kommentar</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Input
                                placeholder="Ditt namn *"
                                value={form.commenter_name}
                                onChange={(e) => setForm({ ...form, commenter_name: e.target.value })}
                                data-testid={`input-comment-name-${post.id}`}
                            />
                            <Input
                                placeholder="E-post (valfritt)"
                                type="email"
                                value={form.commenter_email}
                                onChange={(e) => setForm({ ...form, commenter_email: e.target.value })}
                                data-testid={`input-comment-email-${post.id}`}
                            />
                        </div>
                        <Textarea
                            placeholder="Din kommentar…"
                            rows={3}
                            value={form.comment_text}
                            onChange={(e) => setForm({ ...form, comment_text: e.target.value })}
                            data-testid={`input-comment-text-${post.id}`}
                        />
                        <Button onClick={submit} disabled={busy} data-testid={`button-submit-comment-${post.id}`}>
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
                            <div key={c.id} className="p-3 rounded-md bg-accent/40 text-sm" data-testid={`gallery-comment-${c.id}`}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium">{c.commenter_name}</span>
                                    <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
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
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");

    useEffect(() => {
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get("/posts", { params: q ? { search: q } : {} });
                setPosts(data);
            } catch (e) {
                toast.error(formatApiError(e));
            } finally {
                setLoading(false);
            }
        }, 200);
        return () => clearTimeout(t);
    }, [q]);

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-home">
                        <ArrowLeft size={16} /> Tillbaka
                    </Link>
                    <span className="label-caps">Galleri</span>
                    {user ? (
                        <Link to="/mina-faglar">
                            <Button size="sm" variant="outline" data-testid="button-my-birds-nav">Mina inlägg</Button>
                        </Link>
                    ) : (
                        <div className="w-[100px]" />
                    )}
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-6 py-10">
                <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="label-caps mb-2">Community</p>
                        <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight">
                            Inlägg från flocken
                        </h1>
                        <p className="text-muted-foreground mt-2 max-w-xl">
                            Bilder, berättelser och hälsningar — publicerade efter granskning.
                        </p>
                    </div>
                    {user ? (
                        <Link to="/mina-faglar">
                            <Button data-testid="button-create-post">
                                <PlusCircle size={16} className="mr-2" /> Skapa inlägg
                            </Button>
                        </Link>
                    ) : (
                        <Link to="/login">
                            <Button data-testid="button-login-to-post">
                                <PlusCircle size={16} className="mr-2" /> Skapa konto för att posta
                            </Button>
                        </Link>
                    )}
                </div>

                {!user && (
                    <div className="surface p-4 mb-6 flex items-start gap-3 border-primary/30 bg-primary/5">
                        <ShieldCheck size={20} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium">Bara registrerade medlemmar kan skapa inlägg</p>
                            <p className="text-muted-foreground mt-0.5">
                                <Link to="/login" className="text-primary font-medium underline-offset-2 hover:underline">
                                    Logga in eller skapa ett konto
                                </Link>{" "}
                                för att dela bilder och berättelser om din papegoja.
                                Alla inlägg granskas av admin innan publicering.
                            </p>
                        </div>
                    </div>
                )}

                <div className="mb-6">
                    <Input
                        placeholder="Sök på titel, art, ägare…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-gallery"
                        className="h-11"
                    />
                </div>

                {loading && (
                    <div className="surface p-10 text-center text-muted-foreground">Laddar galleri…</div>
                )}
                {!loading && posts.length === 0 && (
                    <div className="surface p-10 text-center text-muted-foreground">
                        <ImageIcon size={28} weight="duotone" className="mx-auto mb-2" />
                        {q ? "Inga inlägg matchar sökningen." : "Inga publicerade inlägg än — bli först!"}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {posts.map((p) => <PostCard key={p.id} post={p} />)}
                </div>
            </div>
            <PublicFooter />
        </div>
    );
}
