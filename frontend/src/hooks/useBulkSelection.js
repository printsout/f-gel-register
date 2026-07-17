import { useMemo, useState, useCallback } from "react";

/**
 * Reusable bulk-selection hook for admin lists.
 *
 * Usage:
 *   const s = useBulkSelection(items);   // items with `.id`
 *   s.isSelected(id) / s.toggle(id) / s.toggleAll() / s.clear()
 *   s.selectedIds  // array
 *   s.count        // number
 *   s.allSelected  // boolean
 *   s.someSelected // boolean (indeterminate)
 *
 * Optional second arg: keyFn(item) => id, defaults to `item.id`.
 */
export function useBulkSelection(items, keyFn = (item) => item.id) {
    const [selected, setSelected] = useState(() => new Set());

    const ids = useMemo(
        () => (items || []).map((i) => keyFn(i)).filter(Boolean),
        [items, keyFn],
    );

    const selectedIds = useMemo(
        () => ids.filter((id) => selected.has(id)),
        [ids, selected],
    );

    const count = selectedIds.length;
    const allSelected = ids.length > 0 && count === ids.length;
    const someSelected = count > 0 && count < ids.length;

    const isSelected = useCallback((id) => selected.has(id), [selected]);

    const toggle = useCallback((id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setSelected((prev) => {
            if (ids.every((id) => prev.has(id))) {
                const next = new Set(prev);
                for (const id of ids) next.delete(id);
                return next;
            }
            const next = new Set(prev);
            for (const id of ids) next.add(id);
            return next;
        });
    }, [ids]);

    const clear = useCallback(() => setSelected(new Set()), []);

    return {
        selectedIds,
        count,
        allSelected,
        someSelected,
        isSelected,
        toggle,
        toggleAll,
        clear,
    };
}
