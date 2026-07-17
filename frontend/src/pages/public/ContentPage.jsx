import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Feather } from "@phosphor-icons/react";
import api from "@/lib/api";
import PublicFooter from "@/components/PublicFooter";

// Simple, safe Markdown renderer for our CMS content.
// Supports: # / ## / ### headings, **bold**, *italic*, [link](url),
// - list items, blank lines as paragraphs. HTML is escaped first.
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderInline(line) {
    let out = escapeHtml(line);
    // links [text](url)
    out = out.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">$1</a>',
    );
    // bold
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // italic (avoid clashing with bold)
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    return out;
}

function renderMarkdown(text) {
    if (!text) return "";
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let list = [];

    const flushParagraph = () => {
        if (paragraph.length) {
            html.push(
                `<p class="text-base leading-relaxed mb-4">${paragraph.map(renderInline).join(" ")}</p>`,
            );
            paragraph = [];
        }
    };
    const flushList = () => {
        if (list.length) {
            html.push(
                `<ul class="list-disc pl-6 mb-4 space-y-1">${list.map((i) => `<li>${renderInline(i)}</li>`).join("")}</ul>`,
            );
            list = [];
        }
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (line === "") {
            flushParagraph();
            flushList();
            continue;
        }
        const h = line.match(/^(#{1,6})\s+(.+)$/);
        if (h) {
            flushParagraph();
            flushList();
            const level = h[1].length;
            const size = {
                1: "text-3xl md:text-4xl mt-6 mb-4",
                2: "text-2xl md:text-3xl mt-6 mb-3",
                3: "text-xl mt-5 mb-2",
                4: "text-lg mt-4 mb-2",
                5: "text-base mt-3 mb-2",
                6: "text-sm mt-3 mb-2",
            }[level];
            html.push(
                `<h${level} class="font-display font-bold tracking-tight ${size}">${renderInline(h[2])}</h${level}>`,
            );
            continue;
        }
        const li = line.match(/^[-*]\s+(.+)$/);
        if (li) {
            flushParagraph();
            list.push(li[1]);
            continue;
        }
        flushList();
        paragraph.push(line);
    }
    flushParagraph();
    flushList();
    return html.join("");
}

export default function ContentPage() {
    const { slug } = useParams();
    const [page, setPage] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get(`/content/${slug}`)
            .then(({ data }) => setPage(data))
            .catch((e) => setError(e?.response?.status === 404 ? "not-found" : "error"))
            .finally(() => setLoading(false));
    }, [slug]);

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                        data-testid="link-back-home"
                    >
                        <ArrowLeft size={16} /> Tillbaka
                    </Link>
                    <div className="flex items-center gap-2 text-sm">
                        <Feather size={16} weight="duotone" className="text-primary" />
                        <span className="font-display font-bold">Fågelregister</span>
                    </div>
                </div>
            </header>

            <article className="max-w-3xl mx-auto px-6 py-10 fade-in" data-testid={`content-page-${slug}`}>
                {loading && (
                    <div className="text-center text-muted-foreground py-10">Laddar…</div>
                )}
                {!loading && error === "not-found" && (
                    <div className="text-center py-16">
                        <p className="label-caps mb-3">404</p>
                        <h1 className="text-3xl font-display font-bold">Sidan finns inte</h1>
                        <p className="text-muted-foreground mt-2">
                            Sidan har antingen tagits bort eller är inte publicerad.
                        </p>
                        <Link to="/" className="text-primary underline-offset-2 hover:underline mt-6 inline-block">
                            ← Till startsidan
                        </Link>
                    </div>
                )}
                {!loading && error === "error" && (
                    <div className="text-center py-16 text-destructive">
                        Kunde inte ladda sidan. Försök igen senare.
                    </div>
                )}
                {!loading && page && (
                    <>
                        <p className="label-caps mb-3">Fågelregister</p>
                        <h1
                            className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-8"
                            data-testid="content-title"
                        >
                            {page.title}
                        </h1>
                        <div
                            className="prose-neutral max-w-none text-foreground"
                            data-testid="content-body"
                            dangerouslySetInnerHTML={{
                                __html: renderMarkdown(page.content),
                            }}
                        />
                        <p className="text-xs text-muted-foreground mt-10 pt-6 border-t border-border">
                            Senast uppdaterad {page.updated_at?.slice(0, 10)}
                        </p>
                    </>
                )}
            </article>
            <PublicFooter />
        </div>
    );
}
