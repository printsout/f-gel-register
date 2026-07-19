import { useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    TextB,
    TextItalic,
    TextUnderline,
    Link as LinkIcon,
    ListBullets,
    ListNumbers,
    TextAlignLeft,
    TextAlignCenter,
    TextAlignRight,
} from "@phosphor-icons/react";

/**
 * Font choices exposed in the builder. Values are CSS font-family stacks.
 */
export const FONT_FAMILIES = [
    { value: "", label: "Standard (Manrope)" },
    { value: "'Manrope', system-ui, sans-serif", label: "Manrope" },
    { value: "'Playfair Display', Georgia, serif", label: "Playfair Display" },
    { value: "'Inter', system-ui, sans-serif", label: "Inter" },
    { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
    { value: "'Courier New', monospace", label: "Courier" },
];

const PRESET_COLORS = [
    "hsl(var(--foreground))", // default
    "hsl(var(--primary))",
    "hsl(var(--muted-foreground))",
    "#FF5C00", // orange
    "#0D2B1D", // brand green
    "#B91C1C", // red
    "#0369A1", // blue
    "#111827", // near-black
    "#ffffff",
];

function ColorField({ label, value, onChange, testid }) {
    return (
        <div>
            <Label className="label-caps">{label}</Label>
            <div className="flex items-center gap-2 mt-1">
                <input
                    type="color"
                    value={value && value.startsWith("#") ? value : "#111827"}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-9 w-11 rounded border border-border cursor-pointer bg-transparent"
                    data-testid={testid}
                />
                <Input
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Ex. #FF5C00 eller hsl(var(--primary))"
                    className="flex-1"
                />
                <button
                    type="button"
                    onClick={() => onChange("")}
                    className="text-xs text-muted-foreground hover:text-foreground px-2"
                    data-testid={`${testid}-clear`}
                >
                    Rensa
                </button>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => onChange(c)}
                        style={{ background: c }}
                        className="h-6 w-6 rounded-full border border-border shadow-sm hover:scale-110 transition-transform"
                        aria-label={`Välj färg ${c}`}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * <StyleEditor> — bundle of typography controls shared across section editors.
 * Reads/writes `config.style` = { font_family, title_color, text_color, align }.
 */
export function StyleEditor({ style = {}, onChange, testidPrefix = "style" }) {
    const patch = (k, v) => onChange({ ...style, [k]: v });
    return (
        <div className="border-t border-border pt-4 space-y-3">
            <p className="label-caps">Textstil</p>
            <div>
                <Label className="label-caps">Font-familj</Label>
                <Select
                    value={style.font_family || ""}
                    onValueChange={(v) => patch("font_family", v)}
                >
                    <SelectTrigger
                        className="mt-1"
                        data-testid={`${testidPrefix}-font`}
                    >
                        <SelectValue placeholder="Standard" />
                    </SelectTrigger>
                    <SelectContent>
                        {FONT_FAMILIES.map((f) => (
                            <SelectItem key={f.label} value={f.value || "__default"}>
                                <span style={{ fontFamily: f.value || undefined }}>
                                    {f.label}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <ColorField
                label="Rubrikfärg"
                value={style.title_color}
                onChange={(v) => patch("title_color", v)}
                testid={`${testidPrefix}-title-color`}
            />
            <ColorField
                label="Brödtext-färg"
                value={style.text_color}
                onChange={(v) => patch("text_color", v)}
                testid={`${testidPrefix}-text-color`}
            />
            <div>
                <Label className="label-caps">Justering</Label>
                <div className="flex gap-1 mt-1">
                    {[
                        { v: "left", Icon: TextAlignLeft },
                        { v: "center", Icon: TextAlignCenter },
                        { v: "right", Icon: TextAlignRight },
                    ].map(({ v, Icon }) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => patch("align", v)}
                            className={`h-9 w-9 rounded-md border border-border flex items-center justify-center transition-colors ${
                                (style.align || "left") === v
                                    ? "bg-primary/10 border-primary/40 text-primary"
                                    : "hover:bg-muted"
                            }`}
                            data-testid={`${testidPrefix}-align-${v}`}
                            aria-label={`Justering ${v}`}
                        >
                            <Icon size={16} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Compute inline style props from a `style` config object.
 * Callers spread the return: `<h1 style={styleFor(config.style, 'title')}>`.
 */
export function styleFor(style, kind) {
    if (!style) return undefined;
    const out = {};
    if (style.font_family && style.font_family !== "__default")
        out.fontFamily = style.font_family;
    if (kind === "title" && style.title_color) out.color = style.title_color;
    if (kind === "text" && style.text_color) out.color = style.text_color;
    if (style.align) out.textAlign = style.align;
    return out;
}

/**
 * Very lightweight rich text editor built on contenteditable + execCommand.
 * Stores an HTML string in `value`. Fires `onChange(html)` on input.
 * Not a full-blown editor — enough for admin CMS use (B/I/U/link/list).
 */
export function RichTextEditor({ value, onChange, placeholder, testid }) {
    const ref = useRef(null);
    // Only push external value into DOM if it truly changed to avoid caret jump on every keystroke.
    useEffect(() => {
        if (ref.current && (value || "") !== ref.current.innerHTML) {
            ref.current.innerHTML = value || "";
        }
    }, [value]);

    const exec = (cmd, arg) => {
        ref.current?.focus();
        document.execCommand(cmd, false, arg);
        if (ref.current) onChange(ref.current.innerHTML);
    };

    const promptLink = () => {
        const url = window.prompt("Länk-URL (t.ex. https://…)");
        if (url) exec("createLink", url);
    };

    const btn = (label, cmd, Icon, arg) => (
        <button
            type="button"
            onClick={() => (cmd === "link" ? promptLink() : exec(cmd, arg))}
            className="h-8 w-8 rounded-md border border-border bg-card hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`rte-${cmd}`}
            aria-label={label}
            title={label}
        >
            <Icon size={14} weight="bold" />
        </button>
    );

    return (
        <div>
            <div className="flex gap-1 mb-2 flex-wrap">
                {btn("Fet", "bold", TextB)}
                {btn("Kursiv", "italic", TextItalic)}
                {btn("Understruken", "underline", TextUnderline)}
                {btn("Länk", "link", LinkIcon)}
                {btn("Punktlista", "insertUnorderedList", ListBullets)}
                {btn("Numrerad lista", "insertOrderedList", ListNumbers)}
            </div>
            <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => onChange(e.currentTarget.innerHTML)}
                onBlur={(e) => onChange(e.currentTarget.innerHTML)}
                data-placeholder={placeholder || "Skriv här…"}
                data-testid={testid}
                className="rte-editor min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <style>{`
                .rte-editor:empty::before {
                    content: attr(data-placeholder);
                    color: hsl(var(--muted-foreground));
                    pointer-events: none;
                }
                .rte-editor ul { list-style: disc; padding-left: 1.5rem; }
                .rte-editor ol { list-style: decimal; padding-left: 1.5rem; }
                .rte-editor a { color: hsl(var(--primary)); text-decoration: underline; }
            `}</style>
        </div>
    );
}
