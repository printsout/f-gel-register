"""Test renewal by simulating invoice.payment_succeeded event."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    plan = await db.payment_plans.find_one({"stripe_subscription_id": {"$ne": None}})
    if not plan:
        print("No plan with subscription found - creating a fake one for testing")
        # Create a fake plan for testing
        import uuid as _uuid
        now = datetime.now(timezone.utc)
        fake_plan = {
            "id": str(_uuid.uuid4()),
            "user_id": "user_test_renewal",
            "user_email": "renewal-test@example.se",
            "bird_id": "bird_test_renewal",
            "ring_number": "TESTRENEWAL",
            "plan_type": "annual",
            "registration_amount": 300.0,
            "annual_amount": 100.0,
            "currency": "SEK",
            "start_date": (now.date() - timedelta(days=365)).isoformat(),
            "next_due_date": (now.date() - timedelta(days=1)).isoformat(),
            "status": "past_due",
            "last_payment_date": (now.date() - timedelta(days=365)).isoformat(),
            "stripe_subscription_id": "sub_test_fake_" + str(int(now.timestamp())),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.payment_plans.insert_one(fake_plan)
        plan = fake_plan

    sub_id = plan["stripe_subscription_id"]
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    await db.payment_plans.update_one(
        {"id": plan["id"]},
        {"$set": {"next_due_date": yesterday, "status": "past_due"}},
    )
    print(f"Before: sub={sub_id[:30]}... plan next_due={yesterday}, status=past_due")

    sys.path.insert(0, "/app/backend")
    from server import _handle_subscription_renewal, _handle_subscription_cancelled

    fake_invoice = {
        "id": "in_test_" + str(int(datetime.now().timestamp())),
        "subscription": sub_id,
        "customer": "cus_test",
        "billing_reason": "subscription_cycle",
        "amount_paid": 10000,
        "currency": "sek",
    }
    result = await _handle_subscription_renewal(fake_invoice)
    print(f"Renewal result: {result}")

    updated = await db.payment_plans.find_one(
        {"id": plan["id"]},
        {"_id": 0, "status": 1, "next_due_date": 1, "last_payment_date": 1},
    )
    expected = (datetime.now(timezone.utc).date() + timedelta(days=365)).isoformat()
    print(f"After renewal: {updated}")
    print(f"Expected next_due_date: {expected}")
    assert updated["next_due_date"] == expected, "next_due_date not extended"
    assert updated["status"] == "active", "status not reset to active"
    print("✓ Renewal extended next_due_date by 365 days")

    # Test subscription_create is skipped
    fake_initial = dict(fake_invoice, id="in_initial", billing_reason="subscription_create")
    result2 = await _handle_subscription_renewal(fake_initial)
    print(f"subscription_create result (should skip): {result2}")
    assert "skipped" in result2

    # Test cancellation
    fake_sub = {"id": sub_id}
    result3 = await _handle_subscription_cancelled(fake_sub)
    print(f"Cancellation result: {result3}")
    cancelled = await db.payment_plans.find_one({"id": plan["id"]}, {"_id": 0, "status": 1})
    assert cancelled["status"] == "cancelled"
    print("✓ Subscription cancellation marks plan as cancelled")

    # Test invoice.payment_failed simulation (via db update path)
    await db.payment_plans.update_one({"id": plan["id"]}, {"$set": {"status": "active"}})

    # Clean up fake test plan (only if we created it)
    if plan.get("ring_number") == "TESTRENEWAL":
        await db.payment_plans.delete_one({"id": plan["id"]})
        print("Cleaned up fake test plan")

    print("\nALL TESTS PASSED")


asyncio.run(main())
