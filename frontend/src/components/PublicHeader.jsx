import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CaretDown, SignIn, ShoppingCartSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

function TopLink({ item }) {
    const isExternal = /^https?:\/\//.test(item.url);
    if (isExternal) {
        return (
            <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 whitespace-nowrap"
                data-testid={`nav-link-${item.id}`}
            >
                {item.label}
            </a>
        );
    }
    return (
        <Link
            to={item.url}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 whitespace-nowrap"
            data-testid={`nav-link-${item.id}`}
        >
            {item.label}
        </Link>
    );
}

function DropdownItem({ item }) {
    const isExternal = /^https?:\/\//.test(item.url);
    return (
        <DropdownMenuItem asChild data-testid={`nav-child-${item.id}`}>
            {isExternal ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="cursor-pointer">
                    {item.label}
                </a>
            ) : (
                <Link to={item.url} className="cursor-pointer">
                    {item.label}
                </Link>
            )}
        </DropdownMenuItem>
    );
}

function TopWithDropdown({ item }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 flex items-center gap-1 outline-none whitespace-nowrap"
                data-testid={`nav-dropdown-${item.id}`}
            >
                {item.label}
                <CaretDown size={12} weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
                {item.children.map((c) => (
                    <DropdownItem key={c.id} item={c} />
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default function PublicHeader() {
    const { user, isAdmin } = useAuth();
    const [menu, setMenu] = useState([]);

    useEffect(() => {
        api.get("/menu")
            .then(({ data }) => setMenu(data))
            .catch(() => {});
    }, []);

    return (
        <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                <Link
                    to="/"
                    className="flex items-center gap-3 flex-shrink-0 group"
                    data-testid="nav-logo"
                    aria-label="Till startsidan"
                >
                    <img
                        src="/images/fagelregister-logo.png"
                        alt="Fågelregister"
                        className="h-11 md:h-12 w-auto transition-transform group-hover:scale-[1.03]"
                    />
                </Link>

                <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
                    {menu.map((item) =>
                        (item.children || []).length > 0 ? (
                            <TopWithDropdown key={item.id} item={item} />
                        ) : (
                            <TopLink key={item.id} item={item} />
                        ),
                    )}
                </nav>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                        to="/registrera-fagel"
                        aria-label="Till kassan – registrera fågel"
                        data-testid="nav-checkout-icon"
                        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-card hover:bg-primary/10 hover:border-primary/40 transition-colors group"
                    >
                        <ShoppingCartSimple
                            size={20}
                            weight="duotone"
                            className="text-foreground group-hover:text-primary transition-colors"
                        />
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
                    </Link>
                    {user ? (
                        <>
                            <Link to="/mina-faglar">
                                <Button size="sm" variant="outline" data-testid="button-my-birds">
                                    Mina inlägg
                                </Button>
                            </Link>
                            {isAdmin && (
                                <Link to="/admin">
                                    <Button size="sm" data-testid="button-goto-admin">Admin</Button>
                                </Link>
                            )}
                        </>
                    ) : (
                        <Link to="/login">
                            <Button size="sm" variant="outline" data-testid="button-login-nav">
                                <SignIn size={16} className="mr-1.5" /> Logga in
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* Mobile menu — same dropdowns, more compact */}
            <div
                className="md:hidden border-t border-border overflow-x-auto"
                data-testid="mobile-nav-bar"
            >
                <div className="flex gap-1 px-4 py-2 min-w-max">
                    {menu.map((item) =>
                        (item.children || []).length > 0 ? (
                            <TopWithDropdown key={`m-${item.id}`} item={item} />
                        ) : (
                            <TopLink key={`m-${item.id}`} item={item} />
                        ),
                    )}
                </div>
            </div>
        </header>
    );
}
