import os
import random
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.clients.models import Client, Contract, Lead
from apps.content.models import ContentPost
from apps.finance.models import AdSpend, Expense, Invoice, Payment
from apps.projects.models import Project, Task, TimeEntry
from apps.team.models import AgencySettings, Attendance, Note


class Command(BaseCommand):
    help = "Sinov uchun demo ma'lumotlarni yaratadi (admin / admin12345)."

    @transaction.atomic
    def handle(self, *args, **options):
        if Client.objects.exists():
            self.stdout.write(self.style.WARNING("Ma'lumotlar allaqachon mavjud — o'tkazib yuborildi."))
            return
        # Ochiq serverda hammaga ma'lum parollar qo'yilmasligi uchun.
        pw = os.getenv("DEMO_PASSWORD") or ("demo12345" if settings.DEBUG else None)
        if not pw:
            raise CommandError("Production'da DEMO_PASSWORD muhit o'zgaruvchisini bering.")
        random.seed(42)
        today = timezone.localdate()

        if not User.objects.filter(is_superuser=True).exists():
            User.objects.create_superuser("admin", "", "admin12345" if settings.DEBUG else pw,
                                          first_name="Admin", role="admin", job="ceo",
                                          track_attendance=False)

        def emp(username, first, last, job, salary):
            return User.objects.create_user(username, password=pw, first_name=first, last_name=last, job=job,
                                            role=User.JOB_ROLE[job], salary=Decimal(salary))

        staff = [
            emp("aziz", "Aziz", "Karimov", "pm", "9000000"),
            emp("malika", "Malika", "Rahimova", "smm", "6000000"),
            emp("sardor", "Sardor", "Rahimov", "operator", "6500000"),
            emp("bobur", "Bobur", "Yusupov", "editor", "6500000"),
            emp("dilnoza", "Dilnoza", "Usmonova", "designer", "6500000"),
            emp("jasur", "Jasur", "Toshev", "target", "7000000"),
            emp("kamola", "Kamola", "Ergasheva", "b2b", "6000000"),
            emp("gulnora", "Gulnora", "Saidova", "hr", "5500000"),
            emp("nodira", "Nodira", "Aliyeva", "accountant", "5500000"),
        ]
        manager, smm, operator, editor, designer, target, b2b, hr, _ = staff

        clients = [
            Client.objects.create(name=n, industry=i, contact_person=c, phone=p, manager=manager)
            for n, i, c, p in [
                ("Samarqand Non", "Oziq-ovqat", "Bekzod Ergashev", "+998901112233"),
                ("TechPark Mebel", "Mebel", "Shahzod Qodirov", "+998935556677"),
                ("Lola Klinikasi", "Tibbiyot", "Lola Saidova", "+998977778899"),
                ("EduStar o'quv markazi", "Ta'lim", "Akmal Nazarov", "+998909990011"),
            ]
        ]

        services = ["smm", "target", "branding", "smm"]
        projects = []
        for client, service in zip(clients, services):
            fee = Decimal(random.choice([15, 20, 25, 30])) * 1_000_000
            Contract.objects.create(client=client, number=f"SH-{client.pk:03d}", title=f"{service.upper()} xizmati",
                                    start_date=today - timedelta(days=120), monthly_fee=fee, total_amount=fee * 12)
            p = Project.objects.create(client=client, name=f"{client.name} — {service.upper()}", service=service,
                                       status="active", start_date=today - timedelta(days=90),
                                       deadline=today + timedelta(days=60), budget=fee * 3,
                                       ad_budget=Decimal("4000000"), manager=manager)
            p.members.set([smm, target, designer])
            projects.append(p)

        titles = ["Kontent-reja tuzish", "Banner dizayni", "Reklama kampaniyasini sozlash", "Oylik hisobot",
                  "Reels ssenariysi", "Raqobatchilar tahlili", "Logotip variantlari", "Stories seriyasi"]
        for p in projects:
            for t in random.sample(titles, 5):
                task = Task.objects.create(
                    project=p, title=t, status=random.choice(["todo", "in_progress", "review", "done"]),
                    priority=random.choice(["low", "medium", "high", "urgent"]),
                    assignee=random.choice([smm, target, designer]),
                    due_date=today + timedelta(days=random.randint(-5, 20)),
                    estimated_hours=random.choice([2, 4, 6, 8]), created_by=manager,
                )
                for _ in range(random.randint(0, 3)):
                    TimeEntry.objects.create(task=task, user=task.assignee, hours=random.choice([1, 1.5, 2, 3]),
                                             date=today - timedelta(days=random.randint(0, 20)))

            ideas = ["Savol-javob", "Oldin / keyin", "Mijoz fikrlari", "Backstage", "Mahsulot sharhi",
                     "Hafta natijalari", "Aksiya e'loni", "Jamoa bilan tanishuv"]
            for d in range(-20, 16, 2):
                ctype = random.choice(["post", "reels", "story", "carousel", "video"])
                pub = timezone.now() + timedelta(days=d, hours=random.randint(0, 8))
                if d < 0:
                    stage = "published"
                elif ctype in ("reels", "video"):
                    stage = random.choice(["idea", "script", "shoot", "edit", "review", "ready"])
                else:
                    stage = random.choice(["idea", "script", "design", "review", "ready"])
                ContentPost.objects.create(
                    project=p, title=random.choice(ideas), platform=random.choice(["instagram", "telegram", "tiktok"]),
                    content_type=ctype, publish_at=pub, status=stage, assignee=smm,
                    operator=operator if ctype in ("reels", "video") else None,
                    editor=editor if ctype in ("reels", "video") else None,
                    designer=designer if ctype in ("post", "carousel", "story") else None,
                    shoot_at=pub - timedelta(days=4) if ctype in ("reels", "video") else None,
                    edit_deadline=(pub - timedelta(days=2)).date() if ctype in ("reels", "video", "carousel") else None,
                    reach=random.randint(3_000, 40_000) if stage == "published" else 0,
                    engagement=random.randint(100, 2_500) if stage == "published" else 0,
                )
            for d in range(0, 60, 7):
                imp = random.randint(10_000, 60_000)
                clicks = imp * random.randint(1, 4) // 100
                AdSpend.objects.create(project=p, platform=random.choice(["meta", "telegram", "google"]),
                                       date=today - timedelta(days=d), amount=Decimal(random.randint(3, 9) * 100_000),
                                       impressions=imp, clicks=clicks, leads=clicks // random.randint(5, 15))

        n = 1
        for back in range(3, -1, -1):
            issue = today - timedelta(days=30 * back)
            for p in projects:
                inv = Invoice.objects.create(client=p.client, project=p, number=f"INV-{issue.year}-{n:04d}",
                                             issue_date=issue, due_date=issue + timedelta(days=10),
                                             amount=p.budget / 3, status="sent")
                n += 1
                if back > 0:
                    Payment.objects.create(invoice=inv, amount=inv.amount, date=issue + timedelta(days=5))
                elif random.random() < 0.5:
                    Payment.objects.create(invoice=inv, amount=inv.amount / 2, date=today)
                inv.refresh_status()
            month_day = issue.replace(day=min(issue.day, 25))
            for emp in staff:
                Expense.objects.create(category="salary", amount=emp.salary, date=month_day, employee=emp,
                                       description="Oylik maosh")
            Expense.objects.create(category="office", amount=Decimal("6000000"), date=month_day, description="Ofis ijarasi")
            Expense.objects.create(category="software", amount=Decimal("1200000"), date=month_day,
                                   description="Canva, Adobe, CRM obunalari")

        for name, stage, src in [("Bahor Restorani", "new", "instagram"), ("AvtoLider", "contacted", "telegram"),
                                 ("Green Market", "proposal", "website"), ("Fitnes Pro", "negotiation", "referral"),
                                 ("Kitob Dunyosi", "lost", "call"),
                                 ("Malika salon", "new", "instagram"), ("Sarvar avto", "new", "call"),
                                 ("Oltin non", "negotiation", "instagram"), ("Kamol logistika", "proposal", "telegram"),
                                 ("Sitora kids", "won", "referral"), ("Grand market", "lost", "website")]:
            Lead.objects.create(name=name, stage=stage, source=src, assigned_to=b2b,
                                next_action="Qayta qo'ng'iroq", next_action_date=today + timedelta(days=random.randint(-2, 5)),
                                expected_value=Decimal(random.randint(5, 20) * 1_000_000), service="SMM + target")

        seed_team(staff, projects, today)

        self.stdout.write(self.style.SUCCESS(
            "Demo ma'lumotlar yaratildi. Xodimlar: aziz (PM), malika (SMM), sardor (operator), bobur (montajor), "
            "dilnoza (dizayner), jasur (target), kamola (B2B), gulnora (HR), nodira (buxgalter). "
            "Parol: DEMO_PASSWORD yoki lokalda demo12345; lokal admin: admin / admin12345"
        ))


def seed_team(staff, projects, today):
    """So'nggi 3 hafta davomati va bir nechta yozuv."""
    from datetime import time

    s = AgencySettings.get()
    for back in range(1, 22):
        d = today - timedelta(days=back)
        if not s.is_workday(d):
            continue
        for u in staff:
            r = random.random()
            if r < 0.06:
                Attendance.objects.create(user=u, date=d, status="absent")
            elif r < 0.1:
                Attendance.objects.create(user=u, date=d, status="excused", note="Kasal")
            else:
                late = random.random() < 0.15
                Attendance.objects.create(
                    user=u, date=d, status="present",
                    check_in=time(9, random.randint(10, 55)) if late else time(8, random.randint(40, 59)),
                    check_out=time(18, random.randint(0, 30)),
                )
    Note.objects.create(title="Samarqand Non: brief", kind="brief", project=projects[0], author=staff[0], shared=True,
                        body="Maqsad: yangi non turlarini tanishtirish.\nAuditoriya: 25–45 yosh oilalar.\nTon: iliq, uy nonidek.")
    Note.objects.create(title="Reels g'oyalari", kind="idea", author=staff[1], shared=True,
                        body="1. Tandirdan non chiqishi (ASMR)\n2. Mijoz fikrlari\n3. Bir kun novvoyxonada")
