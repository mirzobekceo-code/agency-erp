from datetime import date, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import models


class AgencySettings(models.Model):
    """Agentlik sozlamalari (yagona yozuv)."""

    name = models.CharField("Agentlik nomi", max_length=120, default="Agentlik")
    tagline = models.CharField("Qisqa tavsif", max_length=200, blank=True)
    usd_rate = models.DecimalField("1 $ kursi (so'm)", max_digits=12, decimal_places=2, default=Decimal("12800"))

    work_start = models.TimeField("Ish boshlanishi", default=time(9, 0))
    work_end = models.TimeField("Ish tugashi", default=time(18, 0))
    # Python weekday(): 0 = dushanba ... 6 = yakshanba
    work_days = models.CharField("Ish kunlari", max_length=20, default="0,1,2,3,4,5")
    late_fine = models.DecimalField("Kechikish jarimasi", max_digits=12, decimal_places=2, default=Decimal("30000"))
    late_limit = models.TimeField("Qattiq kechikish chegarasi", default=time(10, 0))
    late_fine_hard = models.DecimalField(
        "Qattiq kechikish jarimasi", max_digits=12, decimal_places=2, default=Decimal("50000")
    )
    absent_fine = models.DecimalField("Kelmaganlik jarimasi", max_digits=12, decimal_places=2, default=Decimal("100000"))
    early_fine = models.DecimalField("Erta ketish jarimasi", max_digits=12, decimal_places=2, default=Decimal("30000"))
    attendance_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Davomatni belgilovchi", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    payday = models.PositiveSmallIntegerField("Oylik berish kuni", default=15)
    remind_days = models.PositiveSmallIntegerField("Muddatdan necha kun oldin eslatish", default=1)

    class Meta:
        verbose_name = "Agentlik sozlamalari"
        verbose_name_plural = "Agentlik sozlamalari"

    def __str__(self):
        return self.name

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def is_workday(self, d: date) -> bool:
        return str(d.weekday()) in self.work_days.split(",")

    def pay_period(self, d: date):
        """d sanasiga eng yaqin o'tgan yoki shu kungi oylik: (oylik sanasi, davr boshi, davr oxiri).

        Oylik P-kuni beriladi va o'tgan oyning P-kunidan shu oyning (P-1)-kunigacha ishlangani uchun.
        """
        day = min(self.payday, 28)
        pay = d.replace(day=day) if d.day >= day else _shift_month(d.replace(day=day), -1)
        start = _shift_month(pay, -1)
        return pay, start, pay - timedelta(days=1)


def _shift_month(d: date, n: int) -> date:
    m = d.month - 1 + n
    return d.replace(year=d.year + m // 12, month=m % 12 + 1)


class Attendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = "present", "Keldi"
        ABSENT = "absent", "Kelmadi"
        EXCUSED = "excused", "Sababli"
        DAY_OFF = "day_off", "Dam olish"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Xodim", on_delete=models.CASCADE,
                             related_name="attendance")
    date = models.DateField("Sana")
    status = models.CharField("Holat", max_length=20, choices=Status.choices)
    check_in = models.TimeField("Keldi", null=True, blank=True)
    check_out = models.TimeField("Ketdi", null=True, blank=True)
    left_with_permission = models.BooleanField("Sababli ketdi", default=False)
    note = models.CharField("Izoh", max_length=255, blank=True)
    fine = models.DecimalField("Jarima", max_digits=12, decimal_places=2, default=0)
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                  related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Davomat"
        verbose_name_plural = "Davomat"
        unique_together = [("user", "date")]
        ordering = ["-date", "user__first_name"]

    def compute_fine(self, s: AgencySettings | None = None) -> Decimal:
        s = s or AgencySettings.get()
        if self.status == self.Status.ABSENT:
            return s.absent_fine
        if self.status != self.Status.PRESENT:
            return Decimal("0")
        fine = Decimal("0")
        if self.check_in and self.check_in > s.work_start:
            fine += s.late_fine_hard if self.check_in > s.late_limit else s.late_fine
        if self.check_out and self.check_out < s.work_end and not self.left_with_permission:
            fine += s.early_fine
        return fine

    def save(self, *args, **kwargs):
        if self.check_in and not self.status:
            self.status = self.Status.PRESENT
        self.fine = self.compute_fine()
        super().save(*args, **kwargs)


class PayrollEntry(models.Model):
    """Oylik vedomostidagi bitta qator: xodimning bir davr uchun maoshi."""

    class Status(models.TextChoices):
        PENDING = "pending", "To'lanmagan"
        PARTIAL = "partial", "Qisman"
        PAID = "paid", "To'langan"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Xodim", on_delete=models.CASCADE,
                             related_name="payroll")
    pay_date = models.DateField("Oylik sanasi")
    period_start = models.DateField("Davr boshi")
    period_end = models.DateField("Davr oxiri")
    base_salary = models.DecimalField("Fiks oylik", max_digits=14, decimal_places=2, default=0)
    fines = models.DecimalField("Jarimalar", max_digits=14, decimal_places=2, default=0)
    fines_waived = models.DecimalField("Kechirilgan jarima", max_digits=14, decimal_places=2, default=0)
    bonus = models.DecimalField("Bonus", max_digits=14, decimal_places=2, default=0)
    advance = models.DecimalField("Avans / ushlanma", max_digits=14, decimal_places=2, default=0)
    paid_amount = models.DecimalField("To'langan", max_digits=14, decimal_places=2, default=0)
    note = models.CharField("Izoh", max_length=255, blank=True)

    class Meta:
        verbose_name = "Oylik"
        verbose_name_plural = "Oylik vedomosti"
        unique_together = [("user", "pay_date")]
        ordering = ["-pay_date", "user__first_name"]

    @property
    def net(self):
        return self.base_salary - self.fines + self.fines_waived + self.bonus - self.advance

    @property
    def balance(self):
        return self.net - self.paid_amount

    @property
    def status(self):
        if self.paid_amount <= 0:
            return self.Status.PENDING
        return self.Status.PAID if self.paid_amount >= self.net else self.Status.PARTIAL


class Note(models.Model):
    """Yozuvlar: g'oyalar, uchrashuv qaydlari, brief'lar."""

    class Kind(models.TextChoices):
        IDEA = "idea", "G'oya"
        MEETING = "meeting", "Uchrashuv qaydi"
        BRIEF = "brief", "Brief"
        OTHER = "other", "Boshqa"

    title = models.CharField("Sarlavha", max_length=200)
    body = models.TextField("Matn", blank=True)
    kind = models.CharField("Turi", max_length=20, choices=Kind.choices, default=Kind.OTHER)
    project = models.ForeignKey("projects.Project", verbose_name="Loyiha", null=True, blank=True,
                                on_delete=models.SET_NULL, related_name="notes")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes")
    shared = models.BooleanField("Jamoa bilan ulashilgan", default=False)
    pinned = models.BooleanField("Yuqorida", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Yozuv"
        verbose_name_plural = "Yozuvlar"
        ordering = ["-pinned", "-updated_at"]

    def __str__(self):
        return self.title


class NoteMessage(models.Model):
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
