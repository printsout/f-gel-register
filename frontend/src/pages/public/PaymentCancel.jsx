import { Link } from "react-router-dom";
import { XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import PublicFooter from "@/components/PublicFooter";
import BackHeader from "@/components/BackHeader";

export default function PaymentCancel() {
    return (
        <div className="min-h-screen bg-background">
            <BackHeader label="Betalning" />
            <div className="max-w-xl mx-auto px-6 py-14">
                <div
                    className="surface p-8 text-center space-y-4"
                    data-testid="payment-cancel-card"
                >
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                        <XCircle
                            size={36}
                            weight="duotone"
                            className="text-destructive"
                        />
                    </div>
                    <h1 className="text-2xl font-display font-bold">
                        Betalningen avbröts
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Ingen debitering har skett. Din registrering är sparad
                        som utkast — slutför betalningen för att aktivera den.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                        <Link to="/registrera-fagel">
                            <Button data-testid="button-retry-register">
                                Försök igen
                            </Button>
                        </Link>
                        <Link to="/">
                            <Button
                                variant="outline"
                                data-testid="button-cancel-home"
                            >
                                Till startsidan
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
            <PublicFooter />
        </div>
    );
}
