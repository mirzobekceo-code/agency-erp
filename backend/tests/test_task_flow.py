from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.clients.models import Client
from apps.projects.models import Project, Task, TaskComment


def mk(username, role="specialist"):
    return User.objects.create_user(username, password="x" * 8, role=role, first_name=username.title())


@override_settings(TELEGRAM_SYNC=True)
@mock.patch("apps.team.telegram.call", return_value=(True, {}))
class TaskFlowTests(APITestCase):
    def setUp(self):
        self.boss, self.pm = mk("boss", "admin"), mk("pm", "manager")
        self.smm, self.op, self.other = mk("smm"), mk("op"), mk("other")
        self.p = Project.objects.create(client=Client.objects.create(name="M"), name="P", manager=self.pm)

    def give(self, by, to, **kw):
        self.client.force_authenticate(by)
        r = self.client.post("/api/tasks/", {"title": "Syomka", "assignee": to.pk, **kw}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data["id"]

    def patch(self, user, tid, data):
        self.client.force_authenticate(user)
        return self.client.patch(f"/api/tasks/{tid}/", data, format="json")

    def test_peer_assignment_and_approval(self, _):
        tid = self.give(self.smm, self.op, project=self.p.pk, checklist=["Joy tanlash", "Syomka"])
        t = Task.objects.get(pk=tid)
        self.assertEqual((t.created_by, t.assignee, len(t.checklist)), (self.smm, self.op, 2))
        # ijrochi boshlaydi va qadamni belgilaydi
        self.assertEqual(self.patch(self.op, tid, {"status": "in_progress"}).data["status"], "in_progress")
        r = self.patch(self.op, tid, {"checklist": [{"text": "Joy tanlash", "done": True}, {"text": "Syomka", "done": False}]})
        self.assertEqual(r.data["steps_done"], 1)
        # ijrochi muddat/ijrochini o'zgartira olmaydi
        self.assertEqual(self.patch(self.op, tid, {"due_date": "2030-01-01"}).status_code, 403)
        # ijrochi "Tayyor" qilsa — tasdiqqa ketadi
        self.assertEqual(self.patch(self.op, tid, {"status": "done"}).data["status"], "review")
        # begona xodim aralasha olmaydi
        self.assertEqual(self.patch(self.other, tid, {"status": "done"}).status_code, 403)
        # beruvchi qaytaradi — sabab izohga yoziladi
        r = self.patch(self.smm, tid, {"status": "in_progress", "return_reason": "Yorug'lik yomon"})
        self.assertEqual((r.data["status"], r.data["returned_count"]), ("in_progress", 1))
        self.assertTrue(TaskComment.objects.filter(task_id=tid, text__contains="Yorug'lik yomon").exists())
        self.patch(self.op, tid, {"status": "review"})
        # loyiha PM'i ham tasdiqlay oladi
        r = self.patch(self.pm, tid, {"status": "done"})
        self.assertEqual(r.data["status"], "done")
        self.assertIsNotNone(r.data["done_at"])

    def test_self_task_can_be_closed_directly(self, _):
        tid = self.give(self.op, self.op)
        self.assertEqual(self.patch(self.op, tid, {"status": "done"}).data["status"], "done")

    def test_general_task_without_project(self, _):
        tid = self.give(self.smm, self.op)
        self.assertIsNone(Task.objects.get(pk=tid).project)
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.get(f"/api/tasks/{tid}/").data["project_name"], None)

    def test_delete_only_supervisor(self, _):
        tid = self.give(self.smm, self.op)
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.delete(f"/api/tasks/{tid}/").status_code, 403)
        self.client.force_authenticate(self.smm)
        self.assertEqual(self.client.delete(f"/api/tasks/{tid}/").status_code, 204)

    def test_tabs_and_stats(self, _):
        today = timezone.localdate()
        a = self.give(self.smm, self.op, due_date=str(today - timedelta(days=1)))
        self.give(self.smm, self.op, due_date=str(today + timedelta(days=5)))
        self.patch(self.op, a, {"status": "review"})
        self.client.force_authenticate(self.op)
        titles = lambda tab: len(self.client.get("/api/tasks/", {"tab": tab}).data["results"])  # noqa: E731
        self.assertEqual((titles("mine"), titles("due"), titles("late")), (2, 1, 1))
        self.patch(self.smm, a, {"status": "done"})
        self.client.force_authenticate(self.op)
        self.assertEqual(titles("mine"), 2)  # yaqinda bajarilgan ham doskada qoladi
        self.client.force_authenticate(self.smm)
        self.patch(self.smm, a, {"status": "review"})
        self.client.force_authenticate(self.smm)
        self.assertEqual(self.client.get("/api/tasks/stats/").data | {}, {
            "mine": 0, "due": 0, "late": 1, "approve": 1, "given": 2, "all": 2})
