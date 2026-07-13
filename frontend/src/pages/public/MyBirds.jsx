import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
    ArrowLeft,
    UploadSimple,
    Trash,
    Image as ImageIcon,
    Bird as BirdIcon,
    Plus,
    X,
} from "@phosphor-icons/react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MAX_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 8;
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function BirdCard({ bird, onUpdated }) {
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef(null);

    const removeImage = async (idx) => {
        if (!window.confirm("Ta bort denna bild?")) return;
        const next = (bird.image_urls || []).filter((_, i) => i !== idx);
        try {
            await api.post(`/birds/${bird.id}/images`, { image_urls: next });
            toast.success("Bild borttagen.");
            onUpdated();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const handleFiles = async (files) => {
        if (!files || files.length === 0) return;

        const current = bird.image_urls || [];
        if (current.length + files.length > MAX_IMAGES) {
            toast.error(`Max ${MAX_IMAGES} bilder per fågel.`);
            return;
        }

        const readers = [];
        for (const file of files) {
            if (!ALLOWED.includes(file.type)) {
                toast.error(`${file.name}: fel format (endast JPG/PNG/WebP).`);
                return;
            }
            if (file.size > MAX_SIZE) {
                toast.error(`${file.name} är större än 5 MB.`);
                return;
            }
            readers.push(
                new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = () => resolve(r.result);
                    r.onerror = () => reject(new Error("Läsningsfel"));
                    r.readAsDataURL(file);
                }),
            );
        }

        setUploading(true);
        try {
            const base64s = await Promise.all(readers);
            const merged = [...current, ...base64s];
            await api.post(`/birds/${bird.id}/images`, { image_urls: merged });
            toast.success("Bilder uppladdade!");
            onUpdated();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = "";
        }
    };

    const images = bird.image_urls || [];

    return (
        <div className="surface p-5 fade-in" data-testid={`my-bird-${bird.id}`}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="font-display text-lg font-bold">
                        {bird.species}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                        {bird.ring_number} · {bird.registration_date}
                    </p>
                </div>
                <Badge variant="outline">{images.length} foto{images.length !== 1 ? "n" : ""}</Badge>
            </div>

            {images.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 mb-3">
                    {images.map((src, i) => (
                        <div key={i} className="relative group">
                            <img
                                src={src}
                                alt={`${bird.species} ${i + 1}`}
                                className="w-full h-24 object-cover rounded-md border border-border"
                                loading="lazy"
                            />
                            <button
                                onClick={() => removeImage(i)}
                                className="absolute top-1 right-1 bg-destructive text-destructive-foreground w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`button-remove-image-${bird.id}-${i}`}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="border border-dashed border-border rounded-md p-4 mb-3 text-center text-muted-foreground">
                    <ImageIcon
                        size={22}
                        weight="duotone"
                        className="mx-auto mb-1"
                    />
                    <p className="text-xs">Inga bilder ännu</p>
                </div>
            )}

            <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
                data-testid={`input-file-${bird.id}`}
            />
            <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={uploading || images.length >= MAX_IMAGES}
                className="w-full"
                data-testid={`button-upload-${bird.id}`}
            >
                <UploadSimple size={16} className="mr-2" />
                {uploading
                    ? "Laddar upp…"
                    : images.length >= MAX_IMAGES
                      ? "Max nått"
                      : "Ladda upp bilder"}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2">
                Max {MAX_IMAGES} bilder · 5 MB/bild · JPG/PNG/WebP
            </p>
        </div>
    );
}

export default function MyBirds() {
    const { user, isLoading } = useAuth();
    const [birds, setBirds] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/my-birds");
            setBirds(data);
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

    if (isLoading || !user) return <Loader />;

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                        data-testid="link-back-home"
                    >
                        <ArrowLeft size={16} />
                        Tillbaka
                    </Link>
                    <span className="label-caps">Mina fåglar</span>
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-6 py-10">
                <div className="mb-8 flex flex-wrap justify-between items-end gap-4">
                    <div>
                        <p className="label-caps mb-2">Din flock</p>
                        <h1 className="text-3xl md:text-4xl font-display font-bold">
                            Mina fåglar
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {birds.length} fågel{birds.length !== 1 ? "ar" : ""}
                            {" · "}ladda upp bilder så syns de i galleriet
                        </p>
                    </div>
                    <Link to="/registrera-fagel">
                        <Button data-testid="button-register-new-bird">
                            <Plus size={16} className="mr-2" />
                            Registrera ny
                        </Button>
                    </Link>
                </div>

                {loading && (
                    <div className="surface p-10 text-center text-muted-foreground">
                        Laddar…
                    </div>
                )}
                {!loading && birds.length === 0 && (
                    <div className="surface p-10 text-center">
                        <BirdIcon
                            size={30}
                            weight="duotone"
                            className="mx-auto mb-2 text-muted-foreground"
                        />
                        <p className="font-medium mb-1">
                            Du har inga registrerade fåglar
                        </p>
                        <p className="text-sm text-muted-foreground mb-6">
                            Registrera din första fågel för att synas i galleriet.
                        </p>
                        <Link to="/registrera-fagel">
                            <Button data-testid="button-register-first-bird">
                                <Plus size={16} className="mr-2" />
                                Registrera fågel
                            </Button>
                        </Link>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {birds.map((b) => (
                        <BirdCard key={b.id} bird={b} onUpdated={load} />
                    ))}
                </div>
            </div>
        </div>
    );
}
