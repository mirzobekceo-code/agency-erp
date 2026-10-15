from django.conf import settings
from django.db import models

from apps.projects.models import Project


class ContentPost(models.Model):
    class Platform(models.TextChoices):
        INSTAGRAM = "instagram", "Instagram"
        TELEGRAM = "telegram", "Telegram"
        FACEBOOK = "facebook", "Facebook"
        TIKTOK = "tiktok", "TikTok"
        YOUTUBE = "youtube", "YouTube"
        OTHER = "other", "Boshqa"

    class Type(models.TextChoices):
        POST = "post", "Post"
        CAROUSEL = "carousel", "Karusel"
        STORY = "story", "Stories"
        REELS = "reels", "Reels / qisqa video"
        VIDEO = "video", "Video"
        ARTICLE = "article", "Maqola"

    class Status(models.TextChoices):
        IDEA = "idea", "G'oya"
        IN_WORK = "in_work", "Tayyorlanmoqda"
        REVIEW = "review", "Mijoz tasdig'ida"
        APPROVED = "approved", "Tasdiqlangan"
        PUBLISHED = "published", "E'lon qilingan"

    project = models.ForeignKey(Project, verbose_name="Loyiha", on_delete=models.CASCADE, related_name="posts")
    title = models.CharField("Sarlavha", max_length=200)
    platform = models.CharField("Platforma", max_length=20, choices=Platform.choices, default=Platform.INSTAGRAM)
    content_type = models.CharField("Turi", max_length=20, choices=Type.choices, default=Type.POST)
    caption = models.TextField("Matn", blank=True)
    media_url = models.URLField("Media havolasi", blank=True)
    publish_at = models.DateTimeField("E'lon vaqti", null=True, blank=True)
    status = models.CharField("Holat", max_length=20, choices=Status.choices, default=Status.IDEA)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Mas'ul", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="posts",
    )
    post_url = models.URLField("E'lon qilingan havola", blank=True)
    reach = models.PositiveIntegerField("Qamrov", default=0)
    engagement = models.PositiveIntegerField("Faollik (like+komment)", default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Kontent"
        verbose_name_plural = "Kontent-reja"
        ordering = ["publish_at"]

    def __str__(self):
        return self.title
