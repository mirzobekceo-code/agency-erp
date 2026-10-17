from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.clients.models import Client, Lead
from apps.content.models import ContentPost
from apps.finance.models import Expense, Invoice, Payment
from apps.projects.models import Project, Task
from apps.team.models import Attendance


class PersonalDashboardTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.boss = User.objects.create_user("boss", password="x" * 8, role="admin")
        self.pm = User.objects.create_user("pm", password="x" * 8, role="manager")
        self.op = User.objects.create_user("op", password="x" * 8, role="specialist")
        c = Client.objects.create(name="M")
        self.p1 = Project.objects.create(client=c, name="P1", status="active", manager=self.pm)
        self.p2 = Project.objects.create(client=c, name="P2", status="active")
        self.p2.members.add(self.op)
        Task.objects.create(project=self.p1, title="pm-bugun", assignee=self.pm, due_date=self.today)
        Task.objects.create(project=self.p1, title="pm-kechikkan", assignee=self.pm,
                            due_date=self.today - timedelta(days=2))
        Task.objects.create(project=self.p2, title="op-vazifa", assignee=self.op, due_date=self.today,
                            status="done")
        ContentPost.objects.create(project=self.p2, title="op-post", publish_at=timezone.now() + timedelta(days=1))
        Lead.objects.create(name="L1", assigned_to=self.pm, next_action_date=self.today)
        Lead.objects.create(name="L2")

    def get(self, user):
        self.client.force_authenticate(user)
        return self.client.get("/api/reports/dashboard/").data

    def test_pm_sees_only_own(self):
        d = self.get(self.pm)
        self.assertEqual([t["title"] for t in d["my_tasks"]], ["pm-kechikkan", "pm-bugun"])
        self.assertEqual(d["today_tasks"], {"total": 1, "done": 0, "overdue": 1})
        self.assertEqual(d["projects"]["active"], 1)
        self.assertEqual(d["leads"]["new"], 2)  # menejer barcha lidlarni ko'radi
        self.assertEqual(d["leads"]["follow_up"], 1)
        self.assertEqual(d["upcoming_posts"], [])
        self.assertNotIn("finance", d)

    def test_operator_sees_only_own(self):
        d = self.get(self.op)
        self.assertEqual(d["my_tasks"], [])  # yagona vazifasi bajarilgan
        self.assertEqual(d["today_tasks"], {"total": 1, "done": 1, "overdue": 0})
        self.assertEqual(d["projects"]["active"], 1)
        self.assertEqual([p["title"] for p in d["upcoming_posts"]], ["op-post"])
        self.assertEqual(d["leads"]["new"], 0)

    def test_admin_sees_all_projects_and_own_attendance(self):
        Attendance.objects.create(user=self.boss, date=self.today, status="absent")
        d = self.get(self.boss)
        self.assertEqual(d["projects"]["active"], 2)
        self.assertEqual(d["my_tasks"], [])
        self.assertEqual(d["attendance"]["status"], "absent")
        self.assertEqual(d["attendance"]["fine"], Decimal("100000"))


class FinanceOverviewTests(APITestCase):
    def setUp(self):
        self.acc = User.objects.create_user("acc", password="x" * 8, role="accountant")
        self.emp = User.objects.create_user("emp", password="x" * 8, salary=Decimal("1000"))
        self.c = Client.objects.create(name="Mijoz")
        self.client.force_authenticate(self.acc)

    def test_receive_without_invoice_creates_paid_invoice(self):
        r = self.client.post("/api/finance/receive/", {"client": self.c.pk, "amount": "500", "method": "cash"})
        self.assertEqual(r.status_code, 201, r.data)
        inv = Invoice.objects.get()
        self.assertEqual(inv.status, "paid")
        self.assertEqual(inv.amount, Decimal("500"))

    def test_receive_against_invoice_and_validation(self):
        inv = Invoice.objects.create(client=self.c, number="X-1", amount=Decimal("1000"), status="sent")
        self.assertEqual(self.client.post("/api/finance/receive/", {"amount": "10"}).status_code, 400)
        self.assertEqual(self.client.post("/api/finance/receive/", {"invoice": inv.pk, "amount": "2000"}).status_code, 400)
        self.client.post("/api/finance/receive/", {"invoice": inv.pk, "amount": "400"})
        inv.refresh_from_db()
        self.assertEqual(inv.status, "partial")
        self.assertEqual(Invoice.objects.count(), 1)

    def test_overview_numbers(self):
        inv = Invoice.objects.create(client=self.c, number="X-1", amount=Decimal("1000"), status="sent")
        Payment.objects.create(invoice=inv, amount=Decimal("600"))
        inv.refresh_status()
        Expense.objects.create(category="salary", amount=Decimal("200"), employee=self.emp)
        Expense.objects.create(category="office", amount=Decimal("150"))
        Expense.objects.create(category="ads", amount=Decimal("50"))
        d = self.client.get("/api/reports/finance-overview/").data
        self.assertEqual(d["revenue"], Decimal("600"))
        self.assertEqual(d["salaries"], Decimal("200"))
        self.assertEqual(d["other_expenses"], Decimal("200"))
        self.assertEqual(d["profit"], Decimal("200"))
        self.assertEqual(d["margin"], 33)
        self.assertEqual(d["receivables"], Decimal("400"))
        self.assertEqual([e["category"] for e in d["expense_breakdown"]], ["salary", "office", "ads"])
        self.assertEqual(len(d["cash_flow"]), 6)
        self.assertEqual(d["expected_payments"][0]["balance"], Decimal("400"))
        self.assertGreaterEqual(d["payroll_left"], Decimal("0"))

    def test_specialist_forbidden(self):
        self.client.force_authenticate(self.emp)
        self.assertEqual(self.client.get("/api/reports/finance-overview/").status_code, 403)
        self.assertEqual(self.client.post("/api/finance/receive/", {"client": self.c.pk, "amount": "1"}).status_code, 403)
