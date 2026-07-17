"""Idempotent Stripe catalog setup for Fågelregister.

Products:
- bird_registration: one-time 300 SEK per bird
- membership_yearly: subscription 100 SEK / year
"""
import os

import stripe
from dotenv import load_dotenv

load_dotenv()

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]


CATALOG = [
    {
        "emergent_product_id": "bird_registration",
        "name": "Fågelregistrering",
        "tax_code": "txcd_10000000",  # general digital services
        "prices": [
            {
                "lookup_key": "bird_registration_fee",
                "amount": 30000,  # 300.00 SEK in öre
                "currency": "sek",
            },
        ],
    },
    {
        "emergent_product_id": "membership_yearly",
        "name": "Medlemskap Fågelregister",
        "tax_code": "txcd_10103001",  # SaaS / recurring digital service
        "prices": [
            {
                "lookup_key": "membership_yearly",
                "amount": 10000,  # 100.00 SEK in öre
                "currency": "sek",
                "interval": "year",
            },
        ],
    },
]


def ensure_tax_settings():
    """Set head office address so Stripe Tax / SMP can operate."""
    s = stripe.tax.Settings.retrieve()
    if s.head_office and getattr(s.head_office, "address", None):
        print("Tax head office already configured.")
        return
    stripe.tax.Settings.modify(
        head_office={
            "address": {
                "country": "SE",
                "line1": "Storgatan 1",
                "city": "Stockholm",
                "postal_code": "11122",
            }
        },
        defaults={"tax_behavior": "inclusive"},
    )
    print("Tax head office set (SE).")


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True, limit=100).auto_paging_iter():
        meta = p.to_dict().get("metadata", {})
        if meta.get("emergent_product_id") == entry["emergent_product_id"]:
            print(f"Product exists: {entry['name']} ({p.id})")
            return p
    product = stripe.Product.create(
        name=entry["name"],
        tax_code=entry.get("tax_code"),
        metadata={
            "managed_by": "emergent",
            "emergent_product_id": entry["emergent_product_id"],
        },
    )
    print(f"Product created: {entry['name']} ({product.id})")
    return product


def ensure_price(product, price_def):
    existing = stripe.Price.list(
        lookup_keys=[price_def["lookup_key"]], active=True, limit=1
    ).data
    if existing:
        current = existing[0]
        matches = (
            current.unit_amount == price_def["amount"]
            and current.currency == price_def["currency"]
        )
        if matches:
            print(f"Price ok: {price_def['lookup_key']}")
            return current
        stripe.Price.modify(current.id, active=False)
        print(f"Deactivated stale price: {price_def['lookup_key']}")

    kwargs = dict(
        product=product.id,
        unit_amount=price_def["amount"],
        currency=price_def["currency"],
        lookup_key=price_def["lookup_key"],
        transfer_lookup_key=True,
    )
    if price_def.get("interval"):
        kwargs["recurring"] = {"interval": price_def["interval"]}
    price = stripe.Price.create(**kwargs)
    print(f"Price created: {price_def['lookup_key']} ({price.id})")
    return price


def main():
    try:
        ensure_tax_settings()
    except Exception as e:  # noqa: BLE001
        print(f"Tax settings warning: {e}")

    for entry in CATALOG:
        product = get_or_create_product(entry)
        for price_def in entry["prices"]:
            ensure_price(product, price_def)


if __name__ == "__main__":
    main()
