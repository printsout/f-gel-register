import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import api from "@/lib/api";

const SiteTextsContext = createContext({
    texts: {},
    refresh: () => {},
});

export function SiteTextsProvider({ children }) {
    const [texts, setTexts] = useState({});

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/site-texts");
            setTexts(data || {});
        } catch (err) {
            // Non-critical: fall back to hard-coded texts. Log for observability.
            console.debug("[site-texts] refresh failed, using fallbacks:", err?.message);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Keep the browser tab title in sync with the admin-editable site.title
    useEffect(() => {
        const t = texts["site.title"];
        if (t && String(t).trim().length > 0) {
            document.title = String(t);
        }
    }, [texts]);

    return (
        <SiteTextsContext.Provider value={{ texts, refresh }}>
            {children}
        </SiteTextsContext.Provider>
    );
}

/**
 * useSiteText – returns the admin-editable text for `key`, or `fallback`
 * if the admin hasn't overridden it yet.
 */
export function useSiteText(key, fallback = "") {
    const ctx = useContext(SiteTextsContext);
    const stored = ctx?.texts?.[key];
    if (stored && String(stored).trim().length > 0) return stored;
    return fallback;
}

/** useSiteTexts – full context accessor (used by the admin editor). */
export function useSiteTexts() {
    return useContext(SiteTextsContext);
}

export default SiteTextsContext;
