import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, FloppyDisk } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PriceSettings() {
    const [reg, setReg] = useState(300);
    const [mem, setMem] = useState(100);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/admin/settings/prices");
            setReg(data.registration_fee_kr);
            setMem(data.membership_fee_kr);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            await api.patch("/admin/settings/prices", {
                registration_fee_kr: parseInt(reg, 10) || 0,
                membership_fee_kr: parseInt(mem, 10) || 0,
            });
            toast.success("Priserna uppdaterade.");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8">
                <p className="label-caps mb-2">Inställningar</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold flex items-center gap-3">
                    <Coins size={30} weight="duotone" className="text-primary" />
                    Priser
                </h1>
                <p className="text-muted-foreground mt-1">
                    Ändra registreringsavgift och årsmedlemsavgift. Nya priser gäller
                    för alla framtida betalningar via Stripe.
                </p>
            </div>

            {loading ? (
                <div className="surface p-8 text-center text-muted-foreground">Laddar…</div>
            ) : (
                <div className="surface p-6 max-w-xl space-y-6">
                    <div>
                        <Label htmlFor="reg">Registreringsavgift (kr per fågel)</Label>
                        <Input
                            id="reg"
                            type="number"
                            min={0}
                            value={reg}
                            onChange={(e) => setReg(e.target.value)}
                            data-testid="input-registration-fee"
                            className="mt-1 text-lg font-semibold"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Engångsavgift som tas vid registrering av varje fågel.
                        </p>
                    </div>
                    <div>
                        <Label htmlFor="mem">Årsmedlemsavgift (kr per år)</Label>
                        <Input
                            id="mem"
                            type="number"
                            min={0}
                            value={mem}
                            onChange={(e) => setMem(e.target.value)}
                            data-testid="input-membership-fee"
                            className="mt-1 text-lg font-semibold"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Återkommande årsavgift via Stripe-prenumeration.
                        </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                        Total första betalning (ny medlem):{" "}
                        <strong className="text-foreground">
                            {(parseInt(reg, 10) || 0) + (parseInt(mem, 10) || 0)} kr
                        </strong>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            onClick={save}
                            disabled={saving}
                            data-testid="button-save-prices"
                        >
                            <FloppyDisk size={16} className="mr-2" />
                            {saving ? "Sparar…" : "Spara priser"}
                        </Button>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
