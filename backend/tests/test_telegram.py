from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.clients.models import Client
from apps.projects.models import Project, Task
from apps.team.models import AgencySettings


@override_settings(TELEGRAM_SYNC=True)
class TelegramTests(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_user("boss", password="x" * 8, role="admin", first_name="Boss")
        self.op = User.objects.create_user("op", password="x" * 8, first_name="Sardor", telegram="@sardor_op")
        self.p = Project.objects.create(client=Client.objects.create(name="M"), name="Loyiha")
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

    def test_only_new_task_and_reassign_messages(self):
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/tasks/", {"project": self.p.pk, "title": "Reels <montaj>", "assignee": self.op.pk,
                                                 "priority": "urgent", "due_date": "2030-01-05", "due_time": "15:00"})
        tid = r.data["id"]
        method, payload = self.sent[-1]
        self.assertEqual((method, payload["chat_id"], payload["message_thread_id"]), ("sendMessage", "-1001", 7))
        text = payload["text"]
        for part in ("Yangi vazifa", "@sardor_op", "Reels &lt;montaj&gt;", "05.01.2030 15:00", "Berdi: Boss"):
            self.assertIn(part, text)
        n = len(self.sent)
        # holat, izoh, tasdiq — Telegram'ga bormaydi
        self.client.force_authenticate(self.op)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/tasks/{tid}/", {"status": "review"})
            self.client.post("/api/task-comments/", {"task": tid, "text": "Tayyor"})
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/tasks/{tid}/", {"status": "done"})
        self.assertEqual(len(self.sent), n)
        # boshqa xodimga o'tkazilsa — unga yangi vazifa xabari
        other = User.objects.create_user("ali", password="x" * 8, first_name="Ali", telegram="ali_dz")
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/tasks/{tid}/", {"assignee": other.pk})
        self.assertIn("o'tkazildi", self.sent[-1][1]["text"])
        self.assertIn("@ali_dz", self.sent[-1][1]["text"])

    def test_task_without_assignee_not_sent(self):
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/tasks/", {"title": "Egasiz"})
        self.assertEqual(self.sent, [])

    def test_disabled_flags_and_unconfigured(self):
        s = AgencySettings.get()
        s.tg_task_created = False
        s.save()
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/tasks/", {"project": self.p.pk, "title": "X", "assignee": self.op.pk})
        self.assertEqual(self.sent, [])
        s.tg_task_created, s.telegram_chat_id = True, ""
        s.save()
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/tasks/", {"project": self.p.pk, "title": "Y", "assignee": self.op.pk})
        self.assertEqual(self.sent, [])

    def test_token_is_write_only(self):
        self.client.force_authenticate(self.op)
        d = self.client.get("/api/settings/").data
        self.assertNotIn("telegram_bot_token", d)
        self.assertTrue(d["telegram_configured"])
        self.client.force_authenticate(self.boss)
        self.client.patch("/api/settings/", {"telegram_bot_token": "", "telegram_chat_id": "-1002"})
        s = AgencySettings.get()
        self.assertEqual((s.telegram_bot_token, s.telegram_chat_id), ("123:ABC", "-1002"))

    def test_test_endpoint_admin_only(self):
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.post("/api/telegram/test/").status_code, 403)
        self.client.force_authenticate(self.boss)
        self.assertEqual(self.client.post("/api/telegram/test/").status_code, 200)
        self.assertEqual(self.sent[-1][0], "sendMessage")

    def test_discover_topics(self):
        updates = [
            {"message": {"chat": {"id": -1009, "type": "supergroup", "title": "Menejment"},
                         "is_topic_message": True, "message_thread_id": 42, "text": "/start",
                         "reply_to_message": {"forum_topic_created": {"name": "Vazifalar"}}}},
            {"message": {"chat": {"id": 5, "type": "private"}, "text": "salom"}},
        ]
        with mock.patch("apps.team.telegram.call", return_value=(True, updates)):
            self.client.force_authenticate(self.boss)
            d = self.client.get("/api/telegram/discover/").data
        self.assertEqual(d, [{"chat_id": "-1009", "chat_title": "Menejment", "thread_id": 42,
                              "topic_name": "Vazifalar", "last_text": "/start"}])

    @mock.patch.dict("os.environ", {"CRON_SECRET": "s3cret"})
    def test_deadline_reminder(self):
        from datetime import datetime

        tz = timezone.get_current_timezone()
        now = timezone.make_aware(datetime(2030, 3, 4, 13, 30), tz)
        mk = lambda title, **kw: Task.objects.create(project=self.p, title=title, assignee=self.op, **kw)  # noqa: E731
        soon = mk("Tez orada", due_date=now.date(), due_time=datetime(2030, 1, 1, 15, 0).time())   # 1.5 soat
        mk("Uzoq", due_date=now.date(), due_time=datetime(2030, 1, 1, 17, 0).time())               # 3.5 soat
        mk("O'tib ketgan", due_date=now.date(), due_time=datetime(2030, 1, 1, 12, 0).time())
        mk("Bajarilgan", due_date=now.date(), due_time=datetime(2030, 1, 1, 14, 0).time(), status="done")
        no_time = mk("Vaqtsiz", due_date=now.date())  # ish kuni oxiri 18:00 — 4.5 soat
        Task.objects.create(project=self.p, title="Egasiz", due_date=now.date(), due_time=datetime(2030, 1, 1, 15, 0).time())
        from apps.team import telegram

        self.assertEqual(telegram.deadline_reminders(now), 1)
        text = self.sent[-1][1]["text"]
        self.assertIn("Tez orada", text)
        self.assertIn("1 soat 30 daqiqa", text)
        self.assertIn("@sardor_op", text)
        self.assertEqual(telegram.deadline_reminders(now), 0)  # ikkinchi marta yuborilmaydi
        # vaqtsiz vazifa: ish kuni oxiridan 2 soat oldin
        self.assertEqual(telegram.deadline_reminders(now.replace(hour=16, minute=5)), 2)  # "Uzoq" va "Vaqtsiz"
        # muddat o'zgarsa — qayta eslatiladi
        soon.refresh_from_db()
        self.assertIsNotNone(soon.reminder_sent_at)
        self.client.force_authenticate(self.boss)
        self.client.patch(f"/api/tasks/{soon.pk}/", {"due_time": "18:30"})
        soon.refresh_from_db()
        self.assertIsNone(soon.reminder_sent_at)
        no_time.refresh_from_db()
        self.assertIsNotNone(no_time.reminder_sent_at)
        # cron endpoint
        self.assertEqual(self.client.get("/api/cron/tick/", {"key": "xato"}).status_code, 403)
        r = self.client.get("/api/cron/tick/", {"key": "s3cret"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("reminders", r.data)

    @mock.patch.dict("os.environ", {"CRON_SECRET": "s3cret"})
    def test_daily_digest_cron(self):
        s = AgencySettings.get()
        s.tg_daily_digest = True
        s.save()
        today = timezone.localdate()
        Task.objects.create(project=self.p, title="Kechikkan", assignee=self.op, due_date=today - timedelta(days=2))
        Task.objects.create(project=self.p, title="Bugungi", assignee=self.op, due_date=today)
        self.assertEqual(self.client.get("/api/cron/daily/", {"key": "xato"}).status_code, 403)
        r = self.client.get("/api/cron/daily/", {"key": "s3cret", "force": "1"})
        self.assertEqual(r.status_code, 200, r.data)
        text = self.sent[-1][1]["text"]
        self.assertIn("Muddati o'tgan: 1", text)
        self.assertIn("2 kun", text)
        self.assertIn("Bugun topshiriladi: 1", text)
        n = len(self.sent)
        self.client.get("/api/cron/daily/", {"key": "s3cret"})  # bugun ikkinchi marta yuborilmaydi
        self.assertEqual(len(self.sent), n)
