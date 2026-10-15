import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.clients.models import Client, Contract, Lead
from apps.content.models import ContentPost
from apps.finance.models import AdSpend, Expense, Invoice, Payment
from apps.projects.models import Project, Task, TimeEntry


class Command(BaseCommand):
    help = "Sinov uchun demo ma'lumotlarni yaratadi (admin / admin12345)."

    @transaction.atomic
    def handle(self, *args, **options):
        if Client.objects.exists():
            self.stdout.write(self.style.WARNING("Ma'lumotlar allaqachon mavjud — o'tkazib yuborildi."))
            return
        random.seed(42)
        today = timezone.localdate()

        admin = User.objects.create_superuser("admin", "", "admin12345", first_name="Admin", role="admin")
        staff = [
            User.objects.create_user("aziz", password="demo12345", first_name="Aziz", last_name="Karimov",
                                     role="manager", position="Loyiha menejeri", salary=Decimal("9000000")),
            User.objects.create_user("malika", password="demo12345", first_name="Malika", last_name="Rahimova",
                                     role="specialist", position="SMM mutaxassis", salary=Decimal("6000000")),
            User.objects.create_user("jasur", password="demo12345", first_name="Jasur", last_name="Toshev",
                                     role="specialist", position="Targetolog", salary=Decimal("7000000")),
            User.objects.create_user("dilnoza", password="demo12345", first_name="Dilnoza", last_name="Usmonova",
                                     role="specialist", position="Dizayner", salary=Decimal("6500000")),
            User.objects.create_user("nodira", password="demo12345", first_name="Nodira", last_name="Aliyeva",
                                     role="accountant", position="Buxgalter", salary=Decimal("5500000")),
        ]
        manager, smm, target, designer, _ = staff

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

            for d in range(0, 14, 2):
                ContentPost.objects.create(
                    project=p, title=f"{p.client.name}: post #{d // 2 + 1}",
                    platform=random.choice(["instagram", "telegram", "tiktok"]),
                    content_type=random.choice(["post", "reels", "story", "carousel"]),
                    publish_at=timezone.now() + timedelta(days=d - 4, hours=random.randint(0, 8)),
                    status="published" if d < 4 else random.choice(["idea", "in_work", "review", "approved"]),
                    assignee=smm,
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
                                 ("Kitob Dunyosi", "lost", "call")]:
            Lead.objects.create(name=name, stage=stage, source=src, assigned_to=manager,
                                expected_value=Decimal(random.randint(5, 20) * 1_000_000), service="SMM + target")

        self.stdout.write(self.style.SUCCESS(
            "Demo ma'lumotlar yaratildi. Kirish: admin / admin12345 (xodimlar: aziz, malika, ... / demo12345)"
        ))
