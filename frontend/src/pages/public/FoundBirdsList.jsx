import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MapPin, MagnifyingGlass } from "@phosphor-icons/react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import PublicFooter from "@/components/PublicFooter";

export default function FoundBirdsList() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");

    useEffect(() => {
        const t = setTimeout(async () => {
            const { data } = await api.get("/found-birds", {
                params: q ? { search: q } : {},
            });
            setItems(data);
        }, 200);
        return () => clearTimeout(t);
    }, [q]);

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                        data-testid="link-back-home"
                    >
                        <ArrowLeft size={16} />
                        Tillbaka
                    </Link>
                    <span className="label-caps">Hittade fåglar</span>
                </div>
            </header>
            <div className="max-w-4xl mx-auto px-6 py-10">
                <h1 className="text-3xl font-display font-bold">
                    Hittade papegojor
                </h1>
                <p className="text-muted-foreground mt-1 mb-6">
                    Rapporter från allmänheten. Har du sett din fågel? Ring
                    upphittaren direkt.
                </p>

                <div className="relative mb-6">
                    <MagnifyingGlass
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        className="pl-10 h-11"
                        placeholder="Sök på plats, ringnummer, beskrivning…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        data-testid="input-search-found"
                    />
                </div>

                {items.length === 0 ? (
                    <div className="surface p-10 text-center text-muted-foreground">
                        Inga rapporter hittades.
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {items.map((b) => (
                            <li
                                key={b.id}
                                className="surface p-5 flex flex-col sm:flex-row sm:items-start gap-4 fade-in"
                                data-testid={`found-bird-${b.id}`}
                            >
                                <div
                                    className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background:
                                            "hsl(var(--primary) / 0.12)",
                                    }}
                                >
                                    <MapPin
                                        size={20}
                                        weight="duotone"
                                        className="text-primary"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium">{b.location}</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {b.description}
                                    </p>
                                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-muted-foreground">
                                        {b.ring_number && (
                                            <span>
                                                Ringnr:{" "}
                                                <span className="font-mono">
                                                    {b.ring_number}
                                                </span>
                                            </span>
                                        )}
                                        <span>Datum: {b.date_found}</span>
                                        <span>
                                            Upphittare: {b.finder_name} –{" "}
                                            <a
                                                href={`tel:${b.finder_phone}`}
                                                className="text-primary font-medium"
                                            >
                                                {b.finder_phone}
                                            </a>
                                        </span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <PublicFooter />
        </div>
    );
}
