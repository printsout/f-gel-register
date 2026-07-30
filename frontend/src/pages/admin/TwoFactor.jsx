import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldSlash, QrCode } from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function otpauthToQrUrl(uri) {
    // Uses free Google Charts–style QR endpoint from qrserver.com
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(uri)}`;
}

export default function TwoFactor() {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [setupData, setSetupData] = useState(null);
    const [code, setCode] = useState("");
    const [disablePw, setDisablePw] = useState("");
    const [disableCode, setDisableCode] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/auth/2fa/status");
            setEnabled(!!data.enabled);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
    }, []);

    const startSetup = async () => {
        setBusy(true);
        try {
            const { data } = await api.post("/auth/2fa/setup");
            setSetupData(data);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    const confirmEnable = async () => {
        setBusy(true);
        try {
            await api.post("/auth/2fa/enable", { code });
            toast.success("2FA aktiverat.");
            setSetupData(null);
            setCode("");
            setEnabled(true);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        setBusy(true);
        try {
            await api.post("/auth/2fa/disable", { password: disablePw, code: disableCode });
            toast.success("2FA inaktiverat.");
            setDisablePw("");
            setDisableCode("");
            setEnabled(false);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8">
                <p className="label-caps mb-2">Säkerhet</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold flex items-center gap-3">
                    {enabled ? (
                        <ShieldCheck size={30} weight="duotone" className="text-[hsl(var(--success))]" />
                    ) : (
                        <ShieldSlash size={30} weight="duotone" className="text-muted-foreground" />
                    )}
                    Tvåfaktors-autentisering
                </h1>
                <p className="text-muted-foreground mt-1">
                    Skydda ditt admin-konto med en engångskod från Google Authenticator, Authy
                    eller Microsoft Authenticator.
                </p>
            </div>

            {loading ? (
                <div className="surface p-8 text-center text-muted-foreground">Laddar…</div>
            ) : enabled ? (
                <div className="surface p-6 max-w-xl space-y-5">
                    <div className="flex items-center gap-3">
                        <ShieldCheck
                            size={28}
                            weight="duotone"
                            className="text-[hsl(var(--success))]"
                        />
                        <div>
                            <p className="font-semibold">2FA är aktiverat</p>
                            <p className="text-sm text-muted-foreground">
                                Du behöver en 6-siffrig kod från din authenticator-app vid inloggning.
                            </p>
                        </div>
                    </div>
                    <div className="border-t border-border pt-5 space-y-3">
                        <p className="label-caps">Inaktivera 2FA</p>
                        <div>
                            <Label>Ditt lösenord</Label>
                            <Input
                                type="password"
                                value={disablePw}
                                onChange={(e) => setDisablePw(e.target.value)}
                                data-testid="input-disable-password"
                            />
                        </div>
                        <div>
                            <Label>Kod från authenticator (6 siffror)</Label>
                            <Input
                                inputMode="numeric"
                                maxLength={8}
                                value={disableCode}
                                onChange={(e) => setDisableCode(e.target.value)}
                                data-testid="input-disable-code"
                            />
                        </div>
                        <Button
                            variant="outline"
                            onClick={disable}
                            disabled={busy || !disablePw || !disableCode}
                            data-testid="btn-disable-2fa"
                        >
                            Inaktivera 2FA
                        </Button>
                    </div>
                </div>
            ) : setupData ? (
                <div className="surface p-6 max-w-xl space-y-5">
                    <p className="label-caps">Steg 2 av 2 — bekräfta koden</p>
                    <p className="text-sm">
                        1. Öppna din authenticator-app (Google Authenticator, Authy, Microsoft
                        Authenticator).
                        <br />
                        2. Skanna QR-koden nedan <em>eller</em> ange nyckeln manuellt.
                        <br />
                        3. Skriv in den 6-siffriga koden och tryck Aktivera.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-5 items-start">
                        <img
                            src={otpauthToQrUrl(setupData.otpauth_uri)}
                            alt="QR-kod för 2FA"
                            className="border border-border rounded-md"
                            data-testid="img-qr-code"
                        />
                        <div className="flex-1 space-y-3">
                            <div>
                                <Label>Manuell nyckel</Label>
                                <Input
                                    value={setupData.secret}
                                    readOnly
                                    className="font-mono text-sm"
                                    data-testid="input-totp-secret"
                                />
                            </div>
                            <div>
                                <Label>Kod (6 siffror)</Label>
                                <Input
                                    inputMode="numeric"
                                    maxLength={8}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="123456"
                                    data-testid="input-verify-code"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setSetupData(null)}
                                    disabled={busy}
                                    data-testid="btn-cancel-2fa"
                                >
                                    Avbryt
                                </Button>
                                <Button
                                    onClick={confirmEnable}
                                    disabled={busy || code.length < 6}
                                    data-testid="btn-confirm-2fa"
                                >
                                    Aktivera 2FA
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="surface p-6 max-w-xl space-y-4">
                    <div className="flex items-center gap-3">
                        <ShieldSlash size={28} weight="duotone" className="text-muted-foreground" />
                        <div>
                            <p className="font-semibold">2FA är inte aktiverat</p>
                            <p className="text-sm text-muted-foreground">
                                Rekommenderat för admin-konton. Ta ~1 minut att sätta upp.
                            </p>
                        </div>
                    </div>
                    <Button onClick={startSetup} disabled={busy} data-testid="btn-start-2fa">
                        <QrCode size={16} className="mr-2" /> Sätt upp 2FA
                    </Button>
                </div>
            )}
        </AdminLayout>
    );
}
