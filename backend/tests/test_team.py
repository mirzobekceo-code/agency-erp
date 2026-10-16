from datetime import date, time
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.finance.models import Expense
from apps.team.models import AgencySettings, Attendance, Note, PayrollEntry


class SettingsLogicTests(APITestCase):
    def test_pay_period(self):
        s = AgencySettings.get()  # payday = 15
        self.assertEqual(s.pay_period(date(2026, 10, 16)), (date(2026, 10, 15), date(2026, 9, 15), date(2026, 10, 14)))
        self.assertEqual(s.pay_period(date(2026, 10, 15))[0], date(2026, 10, 15))
        self.assertEqual(s.pay_period(date(2026, 1, 3)), (date(2025, 12, 15), date(2025, 11, 15), date(2025, 12, 14)))

    def test_fines(self):
        u = User.objects.create_user("w", password="x" * 8)
        d = date(2026, 10, 12)
        cases = [
            (dict(status="present", check_in=time(9, 0), check_out=time(18, 0)), 0),
            (dict(status="present", check_in=time(9, 30)), 30000),
            (dict(status="present", check_in=time(10, 30)), 50000),
            (dict(status="present", check_in=time(9, 0), check_out=time(16, 0)), 30000),
            (dict(status="present", check_in=time(9, 0), check_out=time(16, 0), left_with_permission=True), 0),
            (dict(status="absent"), 100000),
            (dict(status="excused"), 0),
            (dict(status="", check_in=time(9, 45)), 30000),
        ]
        for kw, fine in cases:
            Attendance.objects.filter(user=u, date=d).delete()
            a = Attendance.objects.create(user=u, date=d, **kw)
            self.assertEqual(a.fine, Decimal(fine), kw)
        self.assertEqual(a.status, "present")


class AttendanceApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", password="x" * 8, role="admin", first_name="A")
        self.spec = User.objects.create_user("spec", password="x" * 8, first_name="B", salary=Decimal("5000000"))

    def test_mark_day_and_permissions(self):
        today = timezone.localdate().isoformat()
        self.client.force_authenticate(self.spec)
        r = self.client.post("/api/attendance/day/", {"date": today, "rows": []}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.client.get("/api/attendance/day/", {"date": today})
        self.assertEqual([row["user"] for row in r.data["rows"]], [self.spec.pk])  # faqat o'zi

        self.client.force_authenticate(self.admin)
        r = self.client.post("/api/attendance/day/", {"date": today, "rows": [
            {"user": self.spec.pk, "status": "", "check_in": "09:40", "check_out": None, "note": ""},
            {"user": self.admin.pk, "status": "absent"},
        ]}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["stats"], {"late": 1, "absent": 1})
        # bo'sh holat yozuvni o'chiradi
        self.client.post("/api/attendance/day/", {"date": today, "rows": [{"user": self.admin.pk, "status": ""}]},
                         format="json")
        self.assertFalse(Attendance.objects.filter(user=self.admin).exists())

    def test_settings_change_affects_attendance_manager(self):
        self.client.force_authenticate(self.spec)
        self.assertEqual(self.client.patch("/api/settings/", {"payday": 10}).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.client.patch("/api/settings/", {"attendance_manager": self.spec.pk})
        self.client.force_authenticate(self.spec)
        r = self.client.post("/api/attendance/day/", {"rows": [{"user": self.spec.pk, "status": "present"}]},
                             format="json")
        self.assertEqual(r.status_code, 200)

    def test_month_report(self):
        Attendance.objects.create(user=self.spec, date=date(2026, 9, 1), status="present", check_in=time(10, 5))
        self.client.force_authenticate(self.admin)
        r = self.client.get("/api/attendance/month/", {"month": "2026-09"})
        row = next(x for x in r.data["rows"] if x["user"] == self.spec.pk)
        self.assertEqual(len(row["cells"]), 30)
        self.assertEqual(row["cells"][0], "late")
        self.assertEqual(row["fines"], Decimal("50000"))


class PayrollTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", password="x" * 8, role="admin")
        self.emp = User.objects.create_user("emp", password="x" * 8, salary=Decimal("6000000"))
        Attendance.objects.create(user=self.emp, date=date(2026, 9, 20), status="absent")
        Attendance.objects.create(user=self.emp, date=date(2026, 10, 20), status="absent")  # keyingi davr

    def test_generate_and_pay(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get("/api/payroll/", {"pay_date": "2026-10-15"})
        row = next(x for x in r.data["results"] if x["user"] == self.emp.pk)
        self.assertEqual(Decimal(row["fines"]), Decimal("100000"))
        self.assertEqual(Decimal(row["net"]), Decimal("5900000"))
        self.client.patch(f"/api/payroll/{row['id']}/", {"bonus": "200000"})
        r = self.client.post(f"/api/payroll/{row['id']}/pay/", {"amount": "4000000"})
        self.assertEqual(r.data["status"], "partial")
        self.assertEqual(self.client.post(f"/api/payroll/{row['id']}/pay/", {"amount": "9000000"}).status_code, 400)
        r = self.client.post(f"/api/payroll/{row['id']}/pay/")  # qoldiqni to'liq to'lash
        self.assertEqual(r.data["status"], "paid")
        self.assertEqual(Expense.objects.filter(employee=self.emp, category="salary").count(), 2)
        self.assertEqual(sum(e.amount for e in Expense.objects.all()), Decimal("6100000"))
        # to'langandan keyin fiks oylik o'zgarsa ham vedomost o'zgarmaydi
        self.emp.salary = Decimal("9000000"); self.emp.save()
        self.client.get("/api/payroll/", {"pay_date": "2026-10-15"})
        self.assertEqual(PayrollEntry.objects.get(user=self.emp).base_salary, Decimal("6000000"))

    def test_specialist_cannot_see_payroll(self):
        self.client.force_authenticate(self.emp)
        self.assertEqual(self.client.get("/api/payroll/").status_code, 403)
        self.assertEqual(self.client.get("/api/payroll/mine/").status_code, 200)


class NotesAndProfileTests(APITestCase):
    def setUp(self):
        self.a = User.objects.create_user("a", password="eski-parol-123")
        self.b = User.objects.create_user("b", password="x" * 8)

    def test_note_privacy_and_chat(self):
        private = Note.objects.create(title="maxfiy", author=self.a)
        shared = Note.objects.create(title="umumiy", author=self.a, shared=True)
        self.client.force_authenticate(self.b)
        titles = [n["title"] for n in self.client.get("/api/notes/").data["results"]]
        self.assertEqual(titles, ["umumiy"])
        self.assertEqual(self.client.get(f"/api/notes/{private.pk}/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/notes/{shared.pk}/", {"title": "x"}).status_code, 403)
        r = self.client.post(f"/api/notes/{shared.pk}/messages/", {"text": "salom"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(self.client.get(f"/api/notes/{shared.pk}/messages/").data), 1)

    def test_change_password(self):
        self.client.force_authenticate(self.a)
        self.assertEqual(self.client.post("/api/auth/password/", {"old_password": "xato", "new_password": "yangi-parol-456"}).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/password/", {"old_password": "eski-parol-123", "new_password": "123"}).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/password/", {"old_password": "eski-parol-123", "new_password": "yangi-parol-456"}).status_code, 200)
        self.a.refresh_from_db()
        self.assertTrue(self.a.check_password("yangi-parol-456"))


class DashboardAlertTests(APITestCase):
    def test_alerts_present_for_admin(self):
        admin = User.objects.create_user("boss", password="x" * 8, role="admin")
        self.client.force_authenticate(admin)
        r = self.client.get("/api/reports/dashboard/")
        self.assertIn("alerts", r.data)
