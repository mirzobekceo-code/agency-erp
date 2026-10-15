from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrator"
        MANAGER = "manager", "Loyiha menejeri"
        SPECIALIST = "specialist", "Mutaxassis"
        ACCOUNTANT = "accountant", "Buxgalter"

    role = models.CharField("Rol", max_length=20, choices=Role.choices, default=Role.SPECIALIST)
    position = models.CharField("Lavozim", max_length=100, blank=True)
    phone = models.CharField("Telefon", max_length=20, blank=True)
    telegram = models.CharField("Telegram", max_length=64, blank=True)
    salary = models.DecimalField("Oylik maosh", max_digits=14, decimal_places=2, default=0)
    hired_at = models.DateField("Ishga kirgan sana", null=True, blank=True)

    class Meta:
        verbose_name = "Xodim"
        verbose_name_plural = "Xodimlar"
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return self.get_full_name() or self.username

    @property
    def is_admin(self):
        return self.is_superuser or self.role == self.Role.ADMIN
