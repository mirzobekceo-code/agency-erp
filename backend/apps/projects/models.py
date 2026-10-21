from django.conf import settings
from django.db import models

from apps.clients.models import Client


class Project(models.Model):
    class Service(models.TextChoices):
        SMM = "smm", "SMM"
        TARGET = "target", "Target reklama"
        CONTEXT = "context", "Kontekst reklama"
        SEO = "seo", "SEO"
        BRANDING = "branding", "Brending / dizayn"
        WEBSITE = "website", "Veb-sayt"
        VIDEO = "video", "Video ishlab chiqarish"
        OTHER = "other", "Boshqa"

    class Status(models.TextChoices):
        PLANNING = "planning", "Rejalashtirilmoqda"
        ACTIVE = "active", "Jarayonda"
        ON_HOLD = "on_hold", "To'xtatilgan"
        COMPLETED = "completed", "Yakunlangan"
        CANCELLED = "cancelled", "Bekor qilingan"

    client = models.ForeignKey(Client, verbose_name="Mijoz", on_delete=models.CASCADE, related_name="projects")
    name = models.CharField("Loyiha nomi", max_length=200)
    service = models.CharField("Xizmat turi", max_length=20, choices=Service.choices, default=Service.SMM)
    status = models.CharField("Holat", max_length=20, choices=Status.choices, default=Status.PLANNING)
    start_date = models.DateField("Boshlanish", null=True, blank=True)
    deadline = models.DateField("Muddat", null=True, blank=True)
    budget = models.DecimalField("Loyiha qiymati", max_digits=14, decimal_places=2, default=0)
    ad_budget = models.DecimalField("Reklama byudjeti", max_digits=14, decimal_places=2, default=0)
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Menejer", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="managed_projects",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL, verbose_name="Jamoa", blank=True, related_name="projects",
    )
    description = models.TextField("Tavsif", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Loyiha"
        verbose_name_plural = "Loyihalar"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class Task(models.Model):
    class Status(models.TextChoices):
        TODO = "todo", "Rejada"
        IN_PROGRESS = "in_progress", "Jarayonda"
        REVIEW = "review", "Tasdiqda"
        DONE = "done", "Tayyor"

    class Priority(models.TextChoices):
        LOW = "low", "Past"
        MEDIUM = "medium", "O'rta"
        HIGH = "high", "Yuqori"
        URGENT = "urgent", "Shoshilinch"

    project = models.ForeignKey(Project, verbose_name="Loyiha", null=True, blank=True, on_delete=models.CASCADE,
                                related_name="tasks", help_text="Bo'sh — umumiy (loyihasiz) vazifa")
    title = models.CharField("Vazifa", max_length=255)
    description = models.TextField("Tavsif", blank=True)
    status = models.CharField("Holat", max_length=20, choices=Status.choices, default=Status.TODO)
    priority = models.CharField("Muhimlik", max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Ijrochi", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="tasks",
    )
    due_date = models.DateField("Muddat", null=True, blank=True)
    due_time = models.TimeField("Muddat vaqti", null=True, blank=True,
                                help_text="Bo'sh — ish kuni oxiri (Sozlamalar)")
    reminder_sent_at = models.DateTimeField("Muddat eslatmasi yuborilgan", null=True, blank=True)
    estimated_hours = models.DecimalField("Rejalashtirilgan soat", max_digits=6, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_tasks",
    )
    # Qadamlar: [{"text": "Ssenariy yozish", "done": false}, ...]
    checklist = models.JSONField("Qadamlar", default=list, blank=True)
    done_at = models.DateTimeField("Bajarilgan vaqt", null=True, blank=True)
    returned_count = models.PositiveSmallIntegerField("Qaytarilgan marta", default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Vazifa"
        verbose_name_plural = "Vazifalar"
        ordering = ["due_date", "-created_at"]

    def __str__(self):
        return self.title

    @property
    def deadline(self):
        """Muddat sana+vaqt (vaqt kiritilmagan bo'lsa — ish kuni tugashi)."""
        import datetime as dt

        from django.utils import timezone

        if not self.due_date:
            return None
        if self.due_time:
            t = self.due_time
        else:
            from apps.team.models import AgencySettings

            t = AgencySettings.get().work_end
        return timezone.make_aware(dt.datetime.combine(self.due_date, t))

    def can_supervise(self, user):
        """Vazifani tasdiqlash/qaytarish, tahrirlash va boshqaga berish huquqi:
        vazifani bergan xodim, loyiha PM'i yoki rahbar."""
        return bool(
            user.is_admin
            or (self.created_by_id and self.created_by_id == user.pk)
            or (self.project_id and self.project.manager_id == user.pk)
        )

    def needs_approval(self, user):
        """Ijrochi vazifani o'zi yopa oladimi: o'ziga qo'ygan bo'lsa ha, aks holda tasdiq kerak."""
        return not self.can_supervise(user)


class TaskComment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    text = models.TextField("Izoh")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class TimeEntry(models.Model):
    task = models.ForeignKey(Task, verbose_name="Vazifa", on_delete=models.CASCADE, related_name="time_entries")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Xodim", on_delete=models.CASCADE)
    date = models.DateField("Sana")
    hours = models.DecimalField("Soat", max_digits=5, decimal_places=2)
    note = models.CharField("Izoh", max_length=255, blank=True)

    class Meta:
        verbose_name = "Ish vaqti"
        verbose_name_plural = "Ish vaqtlari"
        ordering = ["-date"]
