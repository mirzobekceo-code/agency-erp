from django.conf import settings
from django.db import models


class Client(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Faol"
        PAUSED = "paused", "To'xtatilgan"
        ARCHIVED = "archived", "Arxiv"

    name = models.CharField("Kompaniya nomi", max_length=200)
    industry = models.CharField("Soha", max_length=100, blank=True)
    contact_person = models.CharField("Mas'ul shaxs", max_length=150, blank=True)
    phone = models.CharField("Telefon", max_length=20, blank=True)
    email = models.EmailField("Email", blank=True)
    telegram = models.CharField("Telegram", max_length=64, blank=True)
    inn = models.CharField("STIR (INN)", max_length=20, blank=True)
    address = models.CharField("Manzil", max_length=255, blank=True)
    status = models.CharField("Holat", max_length=20, choices=Status.choices, default=Status.ACTIVE)
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Menejer", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="managed_clients",
    )
    notes = models.TextField("Izoh", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Mijoz"
        verbose_name_plural = "Mijozlar"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Lead(models.Model):
    class Stage(models.TextChoices):
        NEW = "new", "Yangi"
        CONTACTED = "contacted", "Bog'lanildi"
        PROPOSAL = "proposal", "Taklif yuborildi"
        NEGOTIATION = "negotiation", "Muzokara"
        WON = "won", "Yutildi"
        LOST = "lost", "Yo'qotildi"

    class Source(models.TextChoices):
        INSTAGRAM = "instagram", "Instagram"
        TELEGRAM = "telegram", "Telegram"
        WEBSITE = "website", "Veb-sayt"
        REFERRAL = "referral", "Tavsiya"
        CALL = "call", "Qo'ng'iroq"
        OTHER = "other", "Boshqa"

    name = models.CharField("Ism / kompaniya", max_length=200)
    phone = models.CharField("Telefon", max_length=20, blank=True)
    email = models.EmailField("Email", blank=True)
    source = models.CharField("Manba", max_length=20, choices=Source.choices, default=Source.OTHER)
    stage = models.CharField("Bosqich", max_length=20, choices=Stage.choices, default=Stage.NEW)
    service = models.CharField("Qiziqqan xizmat", max_length=150, blank=True)
    expected_value = models.DecimalField("Kutilayotgan summa", max_digits=14, decimal_places=2, default=0)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Mas'ul", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="leads",
    )
    client = models.ForeignKey(
        Client, verbose_name="Mijozga aylangan", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="leads",
    )
    notes = models.TextField("Izoh", blank=True)
    next_action = models.CharField("Keyingi qadam", max_length=200, blank=True)
    next_action_date = models.DateField("Keyingi qadam sanasi", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Lid"
        verbose_name_plural = "Lidlar"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class Contract(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Qoralama"
        ACTIVE = "active", "Amalda"
        FINISHED = "finished", "Tugagan"
        CANCELLED = "cancelled", "Bekor qilingan"

    client = models.ForeignKey(Client, verbose_name="Mijoz", on_delete=models.CASCADE, related_name="contracts")
    number = models.CharField("Shartnoma raqami", max_length=50)
    title = models.CharField("Predmet", max_length=200, blank=True)
    start_date = models.DateField("Boshlanish sanasi")
    end_date = models.DateField("Tugash sanasi", null=True, blank=True)
    monthly_fee = models.DecimalField("Oylik to'lov", max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField("Umumiy summa", max_digits=14, decimal_places=2, default=0)
    status = models.CharField("Holat", max_length=20, choices=Status.choices, default=Status.ACTIVE)
    file = models.FileField("Fayl", upload_to="contracts/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Shartnoma"
        verbose_name_plural = "Shartnomalar"
        ordering = ["-start_date"]

    def __str__(self):
        return f"{self.number} — {self.client}"
