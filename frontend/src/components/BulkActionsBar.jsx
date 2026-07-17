import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

/**
 * Sticky bottom-right bar shown when at least one row is selected.
 *
 * Props:
 *   count       Number of selected items
 *   onClear     () => void — deselect all
 *   actions     [{ key, label, icon, tone: 'default'|'success'|'destructive', confirm: string|null, onRun: () => Promise<void> }]
 *   entityName  Short entity name for confirmation copy (e.g. "inlägg", "fåglar")
 */
export default function BulkActionsBar({ count, onClear, actions, entityName = "objekt" }) {
    const [pending, setPending] = useState(null); // action pending confirmation
    const [busy, setBusy] = useState(false);

    if (count === 0) return null;

    const run = async (action) => {
        setBusy(true);
        try {
            await action.onRun();
        } finally {
            setBusy(false);
            setPending(null);
        }
    };

    return (
        <>
            <div
                className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full border border-border bg-card shadow-lg px-4 py-2 flex items-center gap-3 max-w-[95vw]"
                data-testid="bulk-actions-bar"
            >
                <span className="text-sm font-medium" data-testid="bulk-count">
                    {count} valda
                </span>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2 flex-wrap">
                    {actions.map((a) => {
                        const toneCls =
                            a.tone === "destructive"
                                ? "text-destructive hover:bg-destructive/10"
                                : a.tone === "success"
                                  ? "text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10"
                                  : "";
                        return (
                            <Button
                                key={a.key}
                                variant="ghost"
                                size="sm"
                                className={`h-8 ${toneCls}`}
                                disabled={busy}
                                onClick={() => {
                                    if (a.confirm) setPending(a);
                                    else run(a);
                                }}
                                data-testid={`bulk-action-${a.key}`}
                            >
                                {a.icon}
                                <span className="ml-1.5">{a.label}</span>
                            </Button>
                        );
                    })}
                </div>
                <button
                    onClick={onClear}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                    aria-label="Avmarkera"
                    data-testid="bulk-clear"
                    disabled={busy}
                >
                    <X size={16} />
                </button>
            </div>

            <AlertDialog
                open={!!pending}
                onOpenChange={(v) => !v && !busy && setPending(null)}
            >
                <AlertDialogContent data-testid="bulk-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pending?.confirmTitle || `${pending?.label} ${count} ${entityName}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pending?.confirm}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            className={
                                pending?.tone === "destructive"
                                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    : ""
                            }
                            onClick={(e) => {
                                e.preventDefault();
                                if (pending) run(pending);
                            }}
                            data-testid="bulk-confirm-run"
                        >
                            {busy ? "Kör…" : pending?.label}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/** Header checkbox for a table — shows indeterminate state when someSelected. */
export function SelectAllCheckbox({ allSelected, someSelected, onToggle, testid = "bulk-select-all" }) {
    return (
        <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={onToggle}
            data-testid={testid}
            aria-label="Markera alla"
        />
    );
}

/** Row checkbox */
export function RowCheckbox({ checked, onToggle, id, testidPrefix = "bulk-select-row" }) {
    return (
        <Checkbox
            checked={checked}
            onCheckedChange={onToggle}
            data-testid={`${testidPrefix}-${id}`}
            aria-label="Markera rad"
        />
    );
}
