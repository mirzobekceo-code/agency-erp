from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.clients.models import Client, Lead
from apps.content.models import ClientReport, ContentPost
from apps.finance.models import AdSpend
from apps.projects.models import Project


def mk(username, job):
    return User.objects.create_user(username, password="x" * 8, job=job, role=User.JOB_ROLE[job])


class JobRoleTests(APITestCase):
    def test_job_sets_role_and_position(self):
        ceo = mk("ceo", "ceo")
        self.client.force_authenticate(ceo)
        for job, role in [("pm", "manager"), ("operator", "specialist"), ("b2b", "sales"), ("hr", "hr")]:
            r = self.client.post("/api/users/", {"username": f"u_{job}", "first_name": "X", "job": job,
                                                 "password": "parol-12345"})
            self.assertEqual(r.status_code, 201, r.data)
            self.assertEqual(r.data["role"], role)
            self.assertEqual(r.data["position"], dict(User.Job.choices)[job])
        # aniq berilgan rol ustun
        r = self.client.post("/api/users/", {"username": "u2", "first_name": "Y", "job": "smm", "role": "manager"})
        self.assertEqual(r.data["role"], "manager")

    def test_hr_and_b2b_permissions(self):
        hr, b2b, op = mk("hr", "hr"), mk("b2b", "b2b"), mk("op", "operator")
        self.client.force_authenticate(hr)
        self.assertEqual(self.client.post("/api/users/", {"username": "new", "first_name": "N", "job": "editor"}).status_code, 201)
        self.assertEqual(self.client.get("/api/payroll/").status_code, 200)
        self.assertEqual(self.client.get("/api/invoices/").status_code, 403)
        self.assertEqual(self.client.post("/api/attendance/day/", {"rows": []}, format="json").status_code, 200)
        self.client.force_authenticate(b2b)
        self.assertEqual(self.client.post("/api/leads/", {"name": "Lid"}).status_code, 201)
        self.assertEqual(self.client.get("/api/payroll/").status_code, 403)
        self.assertEqual(self.client.post("/api/users/", {"username": "z", "first_name": "Z"}).status_code, 403)
        self.client.force_authenticate(op)
        self.assertEqual(self.client.post("/api/leads/", {"name": "Lid"}).status_code, 403)


class StudioTests(APITestCase):
    def setUp(self):
        self.pm, self.smm, self.op, self.ed, self.ds = (mk("pm", "pm"), mk("smm", "smm"), mk("op", "operator"),
                                                        mk("ed", "editor"), mk("ds", "designer"))
        self.p = Project.objects.create(client=Client.objects.create(name="M"), name="P", manager=self.pm)
        now = timezone.now()
        common = dict(project=self.p, assignee=self.smm, operator=self.op, editor=self.ed, designer=self.ds)
        self.shoot = ContentPost.objects.create(title="syomka", status="shoot", shoot_at=now - timedelta(days=2),
                                                publish_at=now + timedelta(days=5), **common)
        self.edit = ContentPost.objects.create(title="montaj", status="edit", edit_deadline=timezone.localdate() + timedelta(days=1),
                                               publish_at=now + timedelta(days=3), **common)
        self.review = ContentPost.objects.create(title="tasdiq", status="review", publish_at=now - timedelta(days=1), **common)
        self.done = ContentPost.objects.create(title="nashr", status="published", publish_at=now - timedelta(days=3), **common)

    def titles(self, user, **params):
        self.client.force_authenticate(user)
        return sorted(x["title"] for x in self.client.get("/api/posts/", params).data["results"])

    def test_queue_by_stage(self):
        self.assertEqual(self.titles(self.op, tab="mine"), ["syomka"])
        self.assertEqual(self.titles(self.ed, tab="mine"), ["montaj"])
        self.assertEqual(self.titles(self.pm, tab="mine"), ["tasdiq"])
        self.assertEqual(self.titles(self.ds, tab="mine"), [])

    def test_late_and_published_filter(self):
        self.assertEqual(self.titles(self.pm, tab="late"), ["syomka", "tasdiq"])
        self.assertEqual(self.titles(self.pm), ["montaj", "syomka", "tasdiq"])
        self.assertIn("nashr", self.titles(self.pm, include_published="1"))

    def test_serializer_responsible_and_late_days(self):
        self.client.force_authenticate(self.pm)
        r = self.client.get(f"/api/posts/{self.shoot.pk}/").data
        self.assertEqual(r["responsible_id"], self.op.pk)
        self.assertEqual(r["late_days"], 2)
        self.assertEqual(r["progress"], 40)

    def test_stats(self):
        self.client.force_authenticate(self.op)
        d = self.client.get("/api/posts/stats/").data
        self.assertEqual(d["stages"]["shoot"], 1)
        self.assertEqual(d["tabs"], {"all": 3, "mine": 1, "week": 2, "late": 2, "review": 1})


class CrmStatsTests(APITestCase):
    def test_stats(self):
        u = mk("b", "b2b")
        Lead.objects.create(name="a", stage="new", expected_value=Decimal("100"))
        Lead.objects.create(name="b", stage="proposal", expected_value=Decimal("200"),
                            next_action_date=timezone.localdate())
        Lead.objects.create(name="c", stage="won", expected_value=Decimal("500"))
        Lead.objects.create(name="d", stage="lost", expected_value=Decimal("50"))
        self.client.force_authenticate(u)
        d = self.client.get("/api/leads/stats/").data
        self.assertEqual(d["pipeline_sum"], Decimal("300"))
        self.assertEqual(d["conversion"], 25)
        self.assertEqual(d["follow_up"], 1)
        self.assertEqual(d["stages"]["won"]["count"], 1)
        r = self.client.patch(f"/api/leads/{Lead.objects.get(name='a').pk}/", {"stage": "contacted"})
        self.assertEqual(r.data["stage"], "contacted")


class ClientReportTests(APITestCase):
    def setUp(self):
        self.smm, self.op = mk("smm", "smm"), mk("op", "operator")
        self.p = Project.objects.create(client=Client.objects.create(name="M"), name="P", status="active")
        tz = timezone.get_current_timezone()
        from datetime import datetime
        for day, reach, st in [(3, 1000, "published"), (10, 5000, "published"), (25, 300, "published"), (28, 0, "idea")]:
            ContentPost.objects.create(project=self.p, title=f"k{day}", status=st, reach=reach,
                                       publish_at=datetime(2026, 9, day, 12, tzinfo=tz))
        AdSpend.objects.create(project=self.p, platform="meta", date=date(2026, 9, 5), amount=Decimal("700"),
                               impressions=9000, clicks=90, leads=9)
        AdSpend.objects.create(project=self.p, platform="meta", date=date(2026, 9, 15), amount=Decimal("300"),
                               impressions=1000, clicks=10, leads=1)

    def test_generate_fill_and_lifecycle(self):
        self.client.force_authenticate(self.smm)
        r = self.client.post("/api/client-reports/generate/", {"month": "2026-09", "project": self.p.pk})
        self.assertEqual(r.status_code, 201, r.data)
        rep = r.data[0]
        self.assertEqual((rep["posts_planned"], rep["posts_published"], rep["reach"]), (4, 3, 6300))
        self.assertEqual(rep["weekly_reach"], [1000, 5000, 0, 300])
        self.assertEqual([t["title"] for t in rep["top_content"]], ["k10", "k3", "k25"])
        self.assertEqual(Decimal(rep["ad_spend"]), Decimal("1000"))
        self.assertEqual(rep["ad_leads"], 10)
        self.assertEqual(rep["campaigns"][0]["clicks"], 100)
        r = self.client.patch(f"/api/client-reports/{rep['id']}/", {"summary": "Yaxshi", "new_followers": 120,
                                                                     "status": "sent"})
        self.assertIsNotNone(r.data["sent_at"])
        # yuborilgan hisobot qayta generatsiyada o'zgarmaydi
        ContentPost.objects.filter(title="k28").update(status="published", reach=999)
        r = self.client.post("/api/client-reports/generate/", {"month": "2026-09", "project": self.p.pk})
        self.assertEqual(r.data[0]["reach"], 6300)
        self.assertEqual(r.data[0]["new_followers"], 120)

    def test_operator_read_only(self):
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.get("/api/client-reports/").status_code, 200)
        self.assertEqual(self.client.post("/api/client-reports/generate/", {"month": "2026-09"}).status_code, 403)
