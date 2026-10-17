from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrator"
        MANAGER = "manager", "Loyiha menejeri"
        SPECIALIST = "specialist", "Mutaxassis"
        ACCOUNTANT = "accountant", "Buxgalter"
        SALES = "sales", "Sotuv (B2B)"
        HR = "hr", "HR"

    class Job(models.TextChoices):
        """Lavozim — xodimning vazifasi. Kirish huquqi (role) undan avtomatik olinadi, lekin o'zgartirsa bo'ladi."""

        CEO = "ceo", "CEO / Direktor"
        PM = "pm", "Project manager"
        SMM = "smm", "SMM manager"
        OPERATOR = "operator", "Video operator"
        EDITOR = "editor", "Videomontajor"
        DESIGNER = "designer", "Grafik dizayner"
        COPYWRITER = "copywriter", "Kopirayter"
        TARGET = "target", "Targetolog"
        B2B = "b2b", "B2B manager"
        HR = "hr", "HR manager"
        ACCOUNTANT = "accountant", "Buxgalter"
        OTHER = "other", "Boshqa"

    JOB_ROLE = {
        "ceo": "admin", "pm": "manager", "smm": "specialist", "operator": "specialist", "editor": "specialist",
        "designer": "specialist", "copywriter": "specialist", "target": "specialist", "b2b": "sales",
        "hr": "hr", "accountant": "accountant", "other": "specialist",
    }

    role = models.CharField("Rol", max_length=20, choices=Role.choices, default=Role.SPECIALIST)
    job = models.CharField("Lavozim", max_length=20, choices=Job.choices, default=Job.OTHER)
    position = models.CharField("Lavozim nomi (ixtiyoriy)", max_length=100, blank=True)
    phone = models.CharField("Telefon", max_length=20, blank=True)
    telegram = models.CharField("Telegram", max_length=64, blank=True)
    salary = models.DecimalField("Oylik maosh", max_digits=14, decimal_places=2, default=0)
    hired_at = models.DateField("Ishga kirgan sana", null=True, blank=True)

    class WorkFormat(models.TextChoices):
        OFFICE = "office", "Ofisda"
        REMOTE = "remote", "Masofadan"
        HYBRID = "hybrid", "Aralash"

    class EmployeeType(models.TextChoices):
        PERMANENT = "permanent", "Doimiy xodim"
        TRIAL = "trial", "Sinov muddatida"
        INTERN = "intern", "Shogird / amaliyotchi"
        FREELANCE = "freelance", "Frilanser"

    work_format = models.CharField("Ish formati", max_length=20, choices=WorkFormat.choices, default=WorkFormat.OFFICE)
    employee_type = models.CharField(
        "Xodim turi", max_length=20, choices=EmployeeType.choices, default=EmployeeType.PERMANENT
    )
    track_attendance = models.BooleanField("Davomatda hisobga olinadi", default=True)

    class Meta:
        verbose_name = "Xodim"
        verbose_name_plural = "Xodimlar"
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return self.get_full_name() or self.username

    def save(self, *args, **kwargs):
        # Lavozim nomi bo'sh yoki avtomatik qo'yilgan bo'lsa — lavozim o'zgarganda u ham yangilanadi
        if not self.position or self.position in self.Job.labels:
            self.position = self.get_job_display() if self.job != self.Job.OTHER else ""
        super().save(*args, **kwargs)

    @property
    def is_admin(self):
        return self.is_superuser or self.role == self.Role.ADMIN
