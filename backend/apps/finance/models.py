from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.clients.models import Client
from apps.projects.models import Project


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Qoralama"
        SENT = "sent", "Yuborilgan"
        PARTIAL = "partial", "Qisman to'langan"
        PAID = "paid", "To'langan"
        CANCELLED = "cancelled", "Bekor qilingan"

    client = models.ForeignKey(Client, verbose_name="Mijoz", on_delete=models.PROTECT, related_name="invoices")
    project = models.ForeignKey(
        Project, verbose_name="Loyiha", null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices",
    )
    number = models.CharField("Hisob-faktura raqami", max_length=50, unique=True)
    issue_date = models.DateField("Sana", default=timezone.localdate)
    due_date = models.DateField("To'lov muddati", null=True, blank=True)
    amount = models.DecimalField("Summa", max_digits=14, decimal_places=2)
    status = models.CharField("Holat", max_length=20, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField("Izoh", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Hisob-faktura"
        verbose_name_plural = "Hisob-fakturalar"
        ordering = ["-issue_date", "-id"]

    def __str__(self):
        return self.number

    @property
    def paid_amount(self):
        return self.payments.aggregate(s=Sum("amount"))["s"] or Decimal("0")

    @property
    def balance(self):
        return self.amount - self.paid_amount

    @property
    def is_overdue(self):
        return (
            self.due_date is not None
            and self.due_date < timezone.localdate()
            and self.status in (self.Status.SENT, self.Status.PARTIAL)
        )

    def refresh_status(self):
        if self.status in (self.Status.DRAFT, self.Status.CANCELLED) and not self.payments.exists():
            return
        paid = self.paid_amount
        if paid >= self.amount:
            new = self.Status.PAID
        elif paid > 0:
            new = self.Status.PARTIAL
        else:
            new = self.Status.SENT
        if new != self.status:
            self.status = new
            self.save(update_fields=["status"])


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Naqd"
        CARD = "card", "Karta"
        TRANSFER = "transfer", "Bank o'tkazmasi"
        OTHER = "other", "Boshqa"

    invoice = models.ForeignKey(Invoice, verbose_name="Hisob-faktura", on_delete=models.CASCADE, related_name="payments")
    date = models.DateField("Sana", default=timezone.localdate)
    amount = models.DecimalField("Summa", max_digits=14, decimal_places=2)
    method = models.CharField("To'lov usuli", max_length=20, choices=Method.choices, default=Method.TRANSFER)
    note = models.CharField("Izoh", max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "To'lov"
        verbose_name_plural = "To'lovlar"
        ordering = ["-date", "-id"]

    @property
    def client(self):
        return self.invoice.client


class Expense(models.Model):
    class Category(models.TextChoices):
        SALARY = "salary", "Maosh"
        ADS = "ads", "Reklama (mijoz byudjeti)"
        FREELANCER = "freelancer", "Frilanser"
        SOFTWARE = "software", "Dasturlar / obunalar"
        OFFICE = "office", "Ofis / ijara"
        EQUIPMENT = "equipment", "Jihozlar"
        TAX = "tax", "Soliq"
        OTHER = "other", "Boshqa"

    category = models.CharField("Turkum", max_length=20, choices=Category.choices, default=Category.OTHER)
    amount = models.DecimalField("Summa", max_digits=14, decimal_places=2)
    date = models.DateField("Sana", default=timezone.localdate)
    project = models.ForeignKey(
        Project, verbose_name="Loyiha", null=True, blank=True, on_delete=models.SET_NULL, related_name="expenses",
    )
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Xodim (maosh uchun)", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="salary_payments",
    )
    description = models.CharField("Tavsif", max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Xarajat"
        verbose_name_plural = "Xarajatlar"
        ordering = ["-date", "-id"]


class AdSpend(models.Model):
    """Mijoz kampaniyalariga reklama platformalarida sarflangan summa."""

    class Platform(models.TextChoices):
        META = "meta", "Meta (Instagram/Facebook)"
        GOOGLE = "google", "Google Ads"
        YANDEX = "yandex", "Yandex Direct"
        TELEGRAM = "telegram", "Telegram Ads"
        TIKTOK = "tiktok", "TikTok Ads"
        OTHER = "other", "Boshqa"

    project = models.ForeignKey(Project, verbose_name="Loyiha", on_delete=models.CASCADE, related_name="ad_spends")
    platform = models.CharField("Platforma", max_length=20, choices=Platform.choices)
    date = models.DateField("Sana", default=timezone.localdate)
    amount = models.DecimalField("Summa", max_digits=14, decimal_places=2)
    impressions = models.PositiveIntegerField("Ko'rishlar", default=0)
    clicks = models.PositiveIntegerField("Bosishlar", default=0)
    leads = models.PositiveIntegerField("Lidlar", default=0)
    note = models.CharField("Izoh", max_length=255, blank=True)

    class Meta:
        verbose_name = "Reklama sarfi"
        verbose_name_plural = "Reklama sarflari"
        ordering = ["-date"]
