# Säkerhetschecklista – rotera exponerade hemligheter

**Bakgrund:** Under tidigare agentsession postades produktionshemligheter i klartext
i chatthistoriken. Alla dessa värden **måste roteras** innan appen körs mot skarpa
kunder. Utför följande steg själv i respektive tjänst — E1 kan inte göra det åt dig.

## 1. MongoDB Atlas
- [ ] Logga in på Atlas → Database Access
- [ ] Radera eller ändra lösenord för databasanvändaren (t.ex. `parrot-app`)
- [ ] Uppdatera `MONGO_URL` i **Railway Variables → backend service**
- [ ] Verifiera anslutning: `curl {BACKEND_URL}/health`
- [ ] Kontrollera att IP whitelist bara innehåller nödvändiga block (Railway egress).

## 2. JWT-hemlighet
- [ ] Generera ny hemlighet: `python -c "import secrets; print(secrets.token_urlsafe(64))"`
- [ ] Uppdatera `JWT_SECRET` (eller motsvarande) i Railway Variables → backend
- [ ] **Notera:** Alla inloggade användare loggas ut när JWT-hemligheten roteras — det är avsett beteende.

## 3. Stripe
- [ ] Stripe Dashboard → **Developers → API keys** → Rulla din secret key
- [ ] Uppdatera `STRIPE_API_KEY` i Railway Variables
- [ ] Stripe → **Webhooks → your endpoint → Signing secret → Roll**
- [ ] Uppdatera `STRIPE_WEBHOOK_SECRET` i Railway Variables
- [ ] Testa: skapa en checkout-session från staging och verifiera webhookflödet.

## 4. E-post (Resend / Emergent-proxy)
- [ ] Om egen Resend-nyckel: Resend Dashboard → **API Keys** → skapa ny, radera gammal
- [ ] Uppdatera `RESEND_API_KEY` (eller motsvarande) i Railway Variables
- [ ] Emergent-managed Resend: kontakta support om nyckeln misstänks vara komprometterad

## 5. Admin-lösenord
- [ ] Logga in som admin i produktions-Railway
- [ ] Byt lösenord via `/glomt-losenord` flödet eller adminvyn
- [ ] Uppdatera `/app/memory/test_credentials.md` med det nya lösenordet (endast lokalt)
- [ ] Bekräfta att inga andra konton har delat samma lösenord

## 6. Bekräfta att inget är committat till GitHub
- [ ] `git log --all -S "STRIPE" -S "MONGO_URL" -S "JWT_SECRET" -- .env` — sök i historiken
- [ ] Om något hittas: rotera igen och överväg `git filter-repo` eller nytt repo
- [ ] Kontrollera `frontend/build/` att inga hemligheter är inlejrade

## 7. Efter rotation
- [ ] Aktivera 2FA för admin-kontot i produktion (`/admin/2fa`)
- [ ] Verifiera `/api/auth/2fa/status` → `{"enabled": true}`
- [ ] Testa hela inloggningsflödet: e-post + lösenord + TOTP-kod
- [ ] Verifiera Stripe test-checkout end-to-end i produktion
- [ ] Verifiera kontakt-mail landar i inkorgen

## 8. Framtida hygien
- Aldrig posta hemligheter i chatt eller i git-historik.
- Använd Railway CLI eller dashboard för att sätta env vars — aldrig via commit.
- Rotera nycklar var 90:e dag som rutin.
- Aktivera `git-secrets` eller motsvarande pre-commit hook.
