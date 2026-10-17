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

    def test_task_lifecycle_messages(self):
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/tasks/", {"project": self.p.pk, "title": "Reels <montaj>",
                                                 "assignee": self.op.pk, "priority": "urgent"})
        tid = r.data["id"]
        method, payload = self.sent[-1]
        self.assertEqual((method, payload["chat_id"], payload["message_thread_id"]), ("sendMessage", "-1001", 7))
        self.assertIn("Yangi vazifa", payload["text"])
        self.assertIn("@sardor_op", payload["text"])
        self.assertIn("Reels &lt;montaj&gt;", payload["text"])  # HTML xavfsiz
        self.client.force_authenticate(self.op)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/tasks/{tid}/", {"status": "review"})
        self.assertIn("Tekshiruvda", self.sent[-1][1]["text"])
        self.assertIn("Tekshiradi: Boss", self.sent[-1][1]["text"])
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/task-comments/", {"task": tid, "text": "Tayyor, ko'rib chiqing"})
        self.assertIn("Izoh", self.sent[-1][1]["text"])
        n = len(self.sent)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/tasks/{tid}/", {"title": "Yangi nom"})  # holat o'zgarmadi
        self.assertEqual(len(self.sent), n)

    def test_disabled_flags_and_unconfigured(self):
        s = AgencySettings.get()
        s.tg_task_created = False
        s.save()
        self.client.force_authenticate(self.boss)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/tasks/", {"project": self.p.pk, "title": "X"})
        self.assertEqual(self.sent, [])
        s.tg_task_created, s.telegram_chat_id = True, ""
        s.save()
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/tasks/", {"project": self.p.pk, "title": "Y"})
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
    def test_daily_digest_cron(self):
        today = timezone.localdate()
        Task.objects.create(project=self.p, title="Kechikkan", assignee=self.op, due_date=today - timedelta(days=2))
        Task.objects.create(project=self.p, title="Bugungi", assignee=self.op, due_date=today)
        self.assertEqual(self.client.get("/api/cron/daily/", {"key": "xato"}).status_code, 403)
        r = self.client.get("/api/cron/daily/", {"key": "s3cret"})
        self.assertEqual(r.status_code, 200, r.data)
        text = self.sent[-1][1]["text"]
        self.assertIn("Muddati o'tgan: 1", text)
        self.assertIn("2 kun", text)
        self.assertIn("Bugun topshiriladi: 1", text)
        n = len(self.sent)
        self.client.get("/api/cron/daily/", {"key": "s3cret"})  # bugun ikkinchi marta yuborilmaydi
        self.assertEqual(len(self.sent), n)
