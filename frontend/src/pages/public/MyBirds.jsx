import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
    ArrowLeft,
    UploadSimple,
    Trash,
    X,
    ClockCountdown,
    CheckCircle,
    XCircle,
    PlusCircle,
    ImageSquare,
    Bird as BirdIcon,
    ShieldCheck,
} from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader } from "@/components/ProtectedRoute";
import PublicFooter from "@/components/PublicFooter";
import BackHeader from "@/components/BackHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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

const MAX_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 8;
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function formatDate(d) {
    if (!d) return "";
    try {
        return new Date(d).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
    } catch {
        return String(d).slice(0, 10);
    }
}

function StatusBadge({ status }) {
    if (status === "approved") {
        return (
            <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" variant="outline">
                <CheckCircle size={12} className="mr-1" /> Publicerad
            </Badge>
        );
    }
    if (status === "rejected") {
        return (
            <Badge className="bg-destructive/10 text-destructive border-destructive/30" variant="outline">
                <XCircle size={12} className="mr-1" /> Avvisad
            </Badge>
        );
    }
    return (
        <Badge className="bg-[hsl(var(--warning))]/15 text-yellow-700 border-yellow-500/40" variant="outline">
            <ClockCountdown size={12} className="mr-1" /> Väntar granskning
        </Badge>
    );
}

function ImagePicker({ images, setImages }) {
    const fileInput = useRef(null);

    const handleFiles = async (files) => {
        if (!files || files.length === 0) return;
        if (images.length + files.length > MAX_IMAGES) {
            toast.error(`Max ${MAX_IMAGES} bilder per inlägg.`);
            return;
        }
        const readers = [];
        for (const file of files) {
            if (!ALLOWED.includes(file.type)) {
                toast.error(`${file.name}: fel format (JPG/PNG/WebP).`);
                return;
            }
            if (file.size > MAX_SIZE) {
                toast.error(`${file.name} är större än 5 MB.`);
                return;
            }
            readers.push(new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = () => rej(new Error("Läsningsfel"));
                r.readAsDataURL(file);
            }));
        }
        try {
            const b64s = await Promise.all(readers);
            setImages([...images, ...b64s]);
        } catch (e) {
            toast.error(e.message);
        } finally {
            if (fileInput.current) fileInput.current.value = "";
        }
    };

    return (
        <div>
            <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
                data-testid="input-post-file"
            />
            {images.length === 0 ? (
                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="w-full border-2 border-dashed border-border hover:border-primary rounded-md p-8 text-center transition-colors"
                    data-testid="button-open-file-picker"
                >
                    <ImageSquare size={28} weight="duotone" className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Ladda upp bilder</p>
                    <p className="text-xs text-muted-foreground mt-1">Max {MAX_IMAGES} · 5 MB/bild · JPG/PNG/WebP</p>
                </button>
            ) : (
                <div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                        {images.map((src, i) => (
                            <div key={i} className="relative group">
                                <img src={src} alt="" className="w-full h-24 object-cover rounded-md border border-border" />
                                <button
                                    type="button"
                                    onClick={() => setImages(images.filter((_, j) => j !== i))}
                                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    data-testid={`button-remove-preview-${i}`}
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                    {images.length < MAX_IMAGES && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInput.current?.click()}
                            data-testid="button-add-more-images"
                        >
                            <UploadSimple size={14} className="mr-2" /> Lägg till fler
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

function PostFormDialog({ open, onOpenChange, birds, onCreated }) {
    const [form, setForm] = useState({ bird_id: "none", title: "", content: "", image_urls: [] });
    const [busy, setBusy] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Reset when dialog opens
    useEffect(() => {
        if (open) setForm({ bird_id: "none", title: "", content: "", image_urls: [] });
    }, [open]);

    const submit = async () => {
        if (!form.title.trim() || !form.content.trim()) {
            toast.error("Rubrik och text krävs.");
            return;
        }
        setBusy(true);
        try {
            const payload = {
                title: form.title.trim(),
                content: form.content.trim(),
                image_urls: form.image_urls,
            };
            if (form.bird_id && form.bird_id !== "none") payload.bird_id = form.bird_id;
            await api.post("/posts", payload);
            onOpenChange(false);
            setShowSuccess(true);
            onCreated();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Skapa nytt inlägg</DialogTitle>
                        <DialogDescription>
                            Dela en berättelse eller bild om din papegoja. Inlägget publiceras efter granskning.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="post-bird">Koppla till en av dina fåglar (valfritt)</Label>
                            <Select value={form.bird_id} onValueChange={(v) => setForm({ ...form, bird_id: v })}>
                                <SelectTrigger id="post-bird" data-testid="select-post-bird" className="mt-1">
                                    <SelectValue placeholder="Välj fågel…" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Ingen koppling</SelectItem>
                                    {birds.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            {b.species} · {b.ring_number}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="post-title">Rubrik *</Label>
                            <Input
                                id="post-title"
                                data-testid="input-post-title"
                                maxLength={140}
                                placeholder="Ex. Kalle lärde sig ett nytt ord idag!"
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="post-content">Berättelse *</Label>
                            <Textarea
                                id="post-content"
                                data-testid="input-post-content"
                                rows={5}
                                maxLength={2000}
                                placeholder="Skriv något om din papegoja…"
                                value={form.content}
                                onChange={(e) => setForm({ ...form, content: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">{form.content.length} / 2000</p>
                        </div>
                        <div>
                            <Label>Bilder</Label>
                            <ImagePicker
                                images={form.image_urls}
                                setImages={(imgs) => setForm({ ...form, image_urls: imgs })}
                            />
                        </div>
                        <div className="rounded-md bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
                            <ShieldCheck size={18} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
                            <p className="text-xs">
                                Ditt inlägg granskas av vår admin innan det publiceras i galleriet.
                                Inlägg som bryter mot våra riktlinjer (spam, stötande innehåll,
                                irrelevant material) publiceras inte.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                            Avbryt
                        </Button>
                        <Button onClick={submit} disabled={busy} data-testid="button-submit-post">
                            {busy ? "Skickar…" : "Skicka för granskning"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Success popup */}
            <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
                <DialogContent className="max-w-md" data-testid="dialog-post-success">
                    <div className="text-center py-4">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck size={32} weight="duotone" className="text-primary" />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-center">
                                Ditt inlägg är skickat!
                            </DialogTitle>
                            <DialogDescription className="text-center pt-2">
                                Ditt inlägg granskas nu av vår admin. Så snart det är
                                godkänt publiceras det i galleriet — vanligtvis inom 24 timmar.
                                Om det bryter mot våra riktlinjer meddelas du med anledningen.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <DialogFooter>
                        <Button
                            className="w-full"
                            onClick={() => setShowSuccess(false)}
                            data-testid="button-close-success"
                        >
                            Okej, jag förstår
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function PostRow({ post, onDelete }) {
    return (
        <div className="surface p-5 fade-in" data-testid={`my-post-${post.id}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={post.status} />
                        <span className="text-xs text-muted-foreground">
                            {formatDate(post.created_at)}
                        </span>
                    </div>
                    <h3 className="font-display text-lg font-bold">{post.title}</h3>
                    {post.bird_species && (
                        <p className="text-xs text-muted-foreground">{post.bird_species}</p>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => onDelete(post)}
                    data-testid={`button-delete-post-${post.id}`}
                >
                    <Trash size={16} />
                </Button>
            </div>
            {post.image_urls?.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                    {post.image_urls.slice(0, 4).map((src, i) => (
                        <img key={i} src={src} alt="" className="w-full h-20 object-cover rounded-md border border-border" />
                    ))}
                </div>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
            {post.status === "rejected" && post.reject_reason && (
                <div className="mt-3 rounded-md bg-destructive/5 border border-destructive/20 p-3">
                    <p className="text-xs text-destructive">
                        <strong>Anledning:</strong> {post.reject_reason}
                    </p>
                </div>
            )}
        </div>
    );
}

export default function MyPosts() {
    const { user, isLoading } = useAuth();
    const [birds, setBirds] = useState([]);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const navigate = useNavigate();

    const load = async () => {
        setLoading(true);
        try {
            const [birdsRes, postsRes] = await Promise.all([
                api.get("/my-birds"),
                api.get("/my-posts"),
            ]);
            setBirds(birdsRes.data);
            setPosts(postsRes.data);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isLoading && !user) {
            navigate("/login", { replace: true, state: { from: "/mina-faglar" } });
        } else if (user) {
            load();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, isLoading]);

    const doDelete = async () => {
        try {
            await api.delete(`/posts/${confirmDelete.id}`);
            toast.success("Inlägg borttaget.");
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    if (isLoading || !user) return <Loader />;

    const pending = posts.filter((p) => p.status === "pending").length;
    const approved = posts.filter((p) => p.status === "approved").length;

    return (
        <div className="min-h-screen bg-background">
            <BackHeader label="Mina inlägg" />

            <div className="max-w-5xl mx-auto px-6 py-10">
                <div className="mb-8 flex flex-wrap justify-between items-end gap-4">
                    <div>
                        <p className="label-caps mb-2">Din community-profil</p>
                        <h1 className="text-3xl md:text-4xl font-display font-bold">
                            Mina inlägg
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {posts.length} inlägg · {approved} publicerade · {pending} väntar granskning
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link to="/registrera-fagel">
                            <Button variant="outline" data-testid="button-register-new-bird">
                                <BirdIcon size={16} className="mr-2" /> Registrera fågel
                            </Button>
                        </Link>
                        <Link to="/agarbyte">
                            <Button variant="outline" data-testid="button-transfer-ownership">
                                Ägarbyte
                            </Button>
                        </Link>
                        <Button
                            onClick={() => {
                                if (birds.length === 0) {
                                    toast.info("Registrera först en fågel så du kan koppla inlägget.");
                                }
                                setDialogOpen(true);
                            }}
                            data-testid="button-new-post"
                        >
                            <PlusCircle size={16} className="mr-2" /> Nytt inlägg
                        </Button>
                    </div>
                </div>

                {loading && (
                    <div className="surface p-10 text-center text-muted-foreground">Laddar…</div>
                )}
                {!loading && posts.length === 0 && (
                    <div className="surface p-10 text-center">
                        <ImageSquare size={30} weight="duotone" className="mx-auto mb-2 text-muted-foreground" />
                        <p className="font-medium mb-1">Du har inga inlägg ännu</p>
                        <p className="text-sm text-muted-foreground mb-6">
                            Skapa ditt första inlägg med bild och berättelse.
                        </p>
                        <Button onClick={() => setDialogOpen(true)} data-testid="button-first-post">
                            <PlusCircle size={16} className="mr-2" /> Skapa inlägg
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {posts.map((p) => (
                        <PostRow key={p.id} post={p} onDelete={setConfirmDelete} />
                    ))}
                </div>
            </div>

            <PostFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                birds={birds}
                onCreated={load}
            />

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(v) => !v && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort inlägg?</AlertDialogTitle>
                        <AlertDialogDescription>
                            "{confirmDelete?.title}" tas bort permanent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={doDelete}
                            data-testid="button-confirm-delete-post"
                        >
                            Ta bort
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <PublicFooter />
        </div>
    );
}
