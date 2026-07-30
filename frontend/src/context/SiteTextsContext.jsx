import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import api from "@/lib/api";

const SiteTextsContext = createContext({ texts: {}, refresh: () => {} });

export function SiteTextsProvider({ children }) {
    const [texts, setTexts] = useState({});

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/site-texts");
            setTexts(data || {});
        } catch (_) {
            /* keep existing texts (or empty) */
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

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

export default SiteTextsContext;
