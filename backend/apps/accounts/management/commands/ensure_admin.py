import os

from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = "ADMIN_USERNAME / ADMIN_PASSWORD muhit o'zgaruvchilaridan administrator yaratadi (bo'lmasa)."

    def handle(self, *args, **options):
        username = os.getenv("ADMIN_USERNAME")
        password = os.getenv("ADMIN_PASSWORD")
        if not username or not password:
            self.stdout.write("ADMIN_USERNAME/ADMIN_PASSWORD berilmagan — o'tkazib yuborildi.")
            return
        if User.objects.filter(username=username).exists():
            self.stdout.write(f"'{username}' allaqachon mavjud.")
            return
        User.objects.create_superuser(username, "", password, first_name="Admin", role=User.Role.ADMIN)
        self.stdout.write(self.style.SUCCESS(f"Administrator '{username}' yaratildi."))
