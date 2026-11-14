from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.clients.models import Client
from apps.content.models import ContentPost
from apps.finance.models import Expense
from apps.projects.models import Deliverable, Project, Task
from apps.team import bot, telegram
from apps.team.models import AgencySettings, PieceWork, TelegramChat, WorkRate


class BotBase(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_user("boss", password="x" * 8, role="admin", first_name="Boss",
                                             telegram="@boss_tg", telegram_user_id=900)
        self.acc = User.objects.create_user("acc", password="x" * 8, role="accountant", first_name="Buxgalter")
        self.op = User.objects.create_user("op", password="x" * 8, first_name="Sardor", telegram="@sardor_op",
                                           employee_type="freelance", job="operator")
        self.client_obj = Client.objects.create(name="Mijoz", telegram_group_id="-2002")
        self.p = Project.objects.create(client=self.client_obj, name="Loyiha", status="active")
        s = AgencySettings.get()
        s.telegram_bot_token, s.telegram_chat_id, s.telegram_tasks_thread_id = "123:ABC", "-1001", 7
        s.save()
        self.sent = []
        patcher = mock.patch("apps.team.telegram.call", side_effect=self.fake_call)
        patcher.start()
        self.addCleanup(patcher.stop)

    def fake_call(self, method, payload, token=None, timeout=10):
        self.sent.append((method, payload))
        return True, {"message_id": 1}

    def messages_to(self, chat_id):
        return [p["text"] for m, p in self.sent if m == "sendMessage" and str(p["chat_id"]) == str(chat_id)]

    def webhook(self, update):
        return self.client.post("/api/telegram/webhook/", update, format="json",
                                HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=bot.webhook_secret())


@override_settings(TELEGRAM_SYNC=True)
class BotTests(BotBase):
    def msg(self, text, chat_id=-1001, chat_type="supergroup", user_id=555, username="sardor_op", **extra):
        return {"update_id": 1, "message": {
            "message_id": 10, "text": text, "chat": {"id": chat_id, "type": chat_type, "title": "G"},
            "from": {"id": user_id, "username": username}, **extra}}

    def test_webhook_requires_secret(self):
        r = self.client.post("/api/telegram/webhook/", {"update_id": 1}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_parse_task_text(self):
        today = date(2026, 11, 14)
        p = bot.parse_task_text("@sardor Kolleksiya syomkasi ertaga 15:00 !", today)
        self.assertEqual((p["username"], p["title"], p["due_date"], p["due_time"], p["priority"]),
                         ("@sardor", "Kolleksiya syomkasi", date(2026, 11, 15), time(15, 0), "high"))
        p = bot.parse_task_text("@x Hisobot 03.01", today)
        self.assertEqual(p["due_date"], date(2027, 1, 3))
        p = bot.parse_task_text("@x Post 18:30", today)
        self.assertEqual((p["due_date"], p["due_time"]), (today, time(18, 30)))

    def test_private_start_links_user(self):
        self.webhook(self.msg("/start", chat_id=555, chat_type="private"))
        self.op.refresh_from_db()
        self.assertEqual(self.op.telegram_user_id, 555)
        self.assertIn("Salom, Sardor", self.messages_to(555)[-1])
        # Noma'lum foydalanuvchi
        self.webhook(self.msg("/start", chat_id=777, chat_type="private", user_id=777, username="kimdir"))
        self.assertIn("topilmadi", self.messages_to(777)[-1])

    def test_task_command_in_team_group(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.webhook(self.msg("/vazifa@agency_bot @sardor_op Syomka ertaga 11:00 !!", user_id=900,
                                  username="boss_tg", is_topic_message=True, message_thread_id=7))
        t = Task.objects.get(title="Syomka")
        self.assertEqual((t.assignee, t.created_by, t.priority, t.due_time), (self.op, self.boss, "urgent", time(11)))
        self.assertIn("@sardor_op", self.messages_to(-1001)[-1])

    def test_unknown_assignee_and_client_group_silence(self):
        self.webhook(self.msg("/vazifa @yoq Ish", user_id=900, username="boss_tg"))
        self.assertIn("topilmadi", self.messages_to(-1001)[-1])
        n = len(self.sent)
        # Mijoz guruhida bot hech narsaga javob bermaydi, lekin guruhni eslab qoladi
        self.webhook(self.msg("/vazifa @sardor_op Ish", chat_id=-2002, user_id=900, username="boss_tg"))
        self.webhook(self.msg("/yordam", chat_id=-2002))
        self.assertEqual(len(self.sent), n)
        self.assertFalse(Task.objects.filter(title="Ish").exists())
        self.assertTrue(TelegramChat.objects.filter(chat_id="-2002").exists())

    def test_status_buttons(self):
        self.op.telegram_user_id = 555
        self.op.save()
        t = Task.objects.create(title="Montaj", assignee=self.op, created_by=self.boss, due_date=date.today())

        def press(ans, uid):
            return self.webhook({"update_id": 2, "callback_query": {
                "id": "cb", "data": f"st:{t.pk}:{ans}", "from": {"id": uid},
                "message": {"message_id": 5, "chat": {"id": -1001}, "is_topic_message": True,
                            "message_thread_id": 7}}})

        press("done", 900)  # ijrochi emas
        self.assertTrue(any(m == "answerCallbackQuery" and p.get("show_alert") for m, p in self.sent))
        press("late", 555)
        t.refresh_from_db()
        self.assertEqual(t.last_status_ask, "late")
        self.assertIn("Kechikadi", self.messages_to(900)[-1])  # vazifa beruvchiga shaxsiy
        press("done", 555)
        t.refresh_from_db()
        self.assertEqual(t.status, "review")
        self.assertIsNotNone(t.submitted_at)
        self.assertTrue(t.comments.filter(text__contains="Tayyor").exists())

    def test_deadline_reminder_has_buttons(self):
        now = timezone.now()
        local = timezone.localtime(now + timedelta(hours=1))
        Task.objects.create(title="Post", assignee=self.op, due_date=local.date(), due_time=local.time())
        telegram.deadline_reminders(now)
        _, payload = [x for x in self.sent if x[0] == "sendMessage"][-1]
        self.assertEqual(len(payload["reply_markup"]["inline_keyboard"][0]), 3)


@override_settings(TELEGRAM_SYNC=True)
class ShootReminderTests(BotBase):
    def test_reminder_only_confirmed_and_once(self):
        s = AgencySettings.get()
        tz = timezone.get_current_timezone()
        now = datetime(2026, 11, 14, 10, 30, tzinfo=tz)
        shoot = datetime(2026, 11, 15, 11, 0, tzinfo=tz)
        ContentPost.objects.create(project=self.p, title="Reels 1", shoot_at=shoot, shoot_confirmed=True,
                                   shoot_location="Studiya")
        ContentPost.objects.create(project=self.p, title="Reels 2", shoot_at=shoot + timedelta(hours=1),
                                   shoot_confirmed=True)
        ContentPost.objects.create(project=self.p, title="Kelishilmagan", shoot_at=shoot)
        self.assertEqual(telegram.shoot_reminders(now.replace(hour=9)), 0)  # hali vaqti emas
        self.assertEqual(telegram.shoot_reminders(now), 1)
        msgs = self.messages_to("-2002")
        self.assertEqual(len(msgs), 1)
        self.assertIn("15-noyabr", msgs[0])
        self.assertIn("11:00", msgs[0])
        self.assertIn("Studiya", msgs[0])
        self.assertNotIn("Reels", msgs[0])  # ichki ma'lumotlar mijozga chiqmaydi
        self.assertEqual(telegram.shoot_reminders(now), 0)
        s.tg_shoot_reminder = False
        s.save()


@override_settings(TELEGRAM_SYNC=True)
class FreelanceTests(BotBase):
    def setUp(self):
        super().setUp()
        self.op.telegram_user_id = 555
        self.op.save()
        self.rate = WorkRate.objects.create(user=self.op, title="Syomka (yarim kun)", price=Decimal("300000"))

    def test_task_approval_accrues_and_dm_only(self):
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/tasks/", {"project": self.p.pk, "title": "Syomka", "assignee": self.op.pk,
                                                 "piece_rate": self.rate.pk, "piece_qty": 2, "piece_pay_mode": "now"})
        tid = r.data["id"]
        self.assertEqual(r.data["piece_info"]["amount"], Decimal("600000"))
        # Boshqa xodimning narxini tanlab bo'lmaydi
        other = WorkRate.objects.create(user=self.acc, title="X", price=1)
        r2 = self.client.patch(f"/api/tasks/{tid}/", {"piece_rate": other.pk})
        self.assertEqual(r2.status_code, 400)

        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.get(f"/api/tasks/{tid}/").data["piece_info"]["title"], "Syomka (yarim kun)")
        self.client.patch(f"/api/tasks/{tid}/", {"status": "done"})  # -> tasdiqqa
        self.assertFalse(PieceWork.objects.exists())

        group_before = len(self.messages_to(-1001))
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/tasks/{tid}/", {"status": "done"})
        pw = PieceWork.objects.get()
        self.assertEqual((pw.amount, pw.pay_mode, pw.project), (Decimal("600000"), "now", self.p))
        dm = self.messages_to(555)[-1]
        self.assertIn("600 000", dm)
        self.assertEqual(len(self.messages_to(-1001)), group_before)  # guruhga pul haqida xabar yo'q

        # Qayta ochilsa — to'lanmagan hisob bekor
        self.client.patch(f"/api/tasks/{tid}/", {"status": "in_progress"})
        self.assertFalse(PieceWork.objects.exists())

    def test_manual_piece_work_pay_and_summary(self):
        self.client.force_authenticate(self.acc)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/piece-works/", {"user": self.op.pk, "rate": self.rate.pk, "pay_mode": "month",
                                                       "project": self.p.pk})
        self.assertEqual(r.status_code, 201, r.data)
        self.client.post("/api/piece-works/", {"user": self.op.pk, "title": "Montaj", "price": 150000,
                                               "pay_mode": "now"})
        summ = self.client.get("/api/piece-works/summary/").data
        self.assertEqual((summ["unpaid_now"], summ["unpaid_month"]), (Decimal("150000"), Decimal("300000")))

        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/piece-works/pay/", {"user": self.op.pk, "pay_mode": "month"}, format="json")
        self.assertEqual(r.data["paid"], 1)
        exp = Expense.objects.get()
        self.assertEqual((exp.category, exp.amount, exp.employee), ("freelancer", Decimal("300000"), self.op))
        self.assertIn("To'landi", self.messages_to(555)[-1])
        self.assertIn("150 000", self.messages_to(555)[-1])  # qolgan qarz
        paid_id = PieceWork.objects.get(paid_at__isnull=False).pk
        self.assertEqual(self.client.delete(f"/api/piece-works/{paid_id}/").status_code, 400)

        # Frilanser faqat o'zinikini ko'radi va o'zgartira olmaydi
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.get("/api/piece-works/").data["count"], 2)
        self.assertEqual(self.client.post("/api/piece-works/", {"user": self.op.pk, "title": "x", "price": 1})
                         .status_code, 403)
        self.client.force_authenticate(User.objects.create_user("smm", password="x" * 8))
        self.assertEqual(self.client.get("/api/piece-works/").data["count"], 0)
        self.assertEqual(self.client.get("/api/work-rates/").data, [])

        self.client.force_authenticate(self.boss)
        ov = self.client.get("/api/reports/finance-overview/").data
        self.assertEqual(ov["freelance_unpaid"], Decimal("150000"))


@override_settings(TELEGRAM_SYNC=True)
class KpiAndDeliverableTests(BotBase):
    def test_kpi_and_monthly_dm(self):
        tz = timezone.get_current_timezone()
        good = User.objects.create_user("good", password="x" * 8, first_name="Aziz")
        d = date(2026, 10, 10)
        Task.objects.create(title="A", assignee=good, status="done", due_date=d, due_time=time(18),
                            submitted_at=datetime(2026, 10, 10, 12, tzinfo=tz), done_at=datetime(2026, 10, 11, tzinfo=tz))
        Task.objects.create(title="B", assignee=self.op, status="done", due_date=d, due_time=time(18),
                            submitted_at=datetime(2026, 10, 12, tzinfo=tz), done_at=datetime(2026, 10, 12, tzinfo=tz),
                            returned_count=2)
        Task.objects.create(title="C", assignee=self.op, status="in_progress", due_date=d)
        self.client.force_authenticate(self.boss)
        data = self.client.get("/api/reports/kpi/?month=2026-10").data
        rows = {r["name"]: r for r in data["rows"]}
        self.assertEqual((rows["Aziz"]["on_time_pct"], rows["Aziz"]["done"]), (100, 1))
        self.assertEqual((rows["Sardor"]["late"], rows["Sardor"]["overdue_open"], rows["Sardor"]["returned"]),
                         (2, 1, 2))
        self.assertEqual(data["rows"][0]["name"], "Aziz")
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.get("/api/reports/kpi/").status_code, 403)

        # Oy oxiri: faqat rahbarga shaxsiy xabar, bir marta
        s = AgencySettings.get()
        self.assertIsNone(telegram.monthly_kpi(datetime(2026, 10, 31, 12, tzinfo=tz)))  # hali ish tugamagan
        self.assertEqual(telegram.monthly_kpi(datetime(2026, 10, 31, 18, 5, tzinfo=tz)), "yuborildi")
        text = self.messages_to(900)[-1]
        self.assertIn("Oktabr 2026", text)
        self.assertIn("Aziz", text)
        self.assertEqual(self.messages_to(-1001), [])
        self.assertIsNone(telegram.monthly_kpi(datetime(2026, 11, 1, 10, tzinfo=tz)))
        s.refresh_from_db()
        self.assertEqual(s.last_kpi_month, "2026-10")

    def test_deliverables(self):
        today = timezone.localdate()
        self.client.force_authenticate(self.boss)
        r = self.client.post("/api/deliverables/", {
            "project": self.p.pk, "title": "Reels", "quantity": 4, "content_type": "reels",
            "period_start": str(today - timedelta(days=20)), "due_date": str(today + timedelta(days=5)),
            "responsible": self.op.pk})
        self.assertEqual(r.status_code, 201, r.data)
        ContentPost.objects.create(project=self.p, title="R1", content_type="reels", status="published",
                                   publish_at=timezone.now())
        row = self.client.get(f"/api/deliverables/?project={self.p.pk}").data["results"][0]
        self.assertEqual((row["done_count"], row["state"]), (1, "behind"))
        dash = self.client.get("/api/reports/dashboard/").data
        self.assertTrue(any("Majburiyatlar" in a["text"] for a in dash["alerts"]))
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.post("/api/deliverables/", {"project": self.p.pk, "title": "x"}).status_code, 403)
