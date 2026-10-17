from django.conf import settings
from django.db import models
from django.utils import timezone

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
        """Ishlab chiqarish bosqichlari (Kontent studio)."""

        IDEA = "idea", "G'oya"
        SCRIPT = "script", "Ssenariy"
        SHOOT = "shoot", "Syomka"
        EDIT = "edit", "Montaj"
        DESIGN = "design", "Dizayn"
        REVIEW = "review", "Tasdiq"
        READY = "ready", "Nashrga tayyor"
        PUBLISHED = "published", "Nashr qilindi"

    # Bosqich bo'yicha bajarilish foizi (loyiha progressi uchun)
    STAGE_PROGRESS = {"idea": 0, "script": 20, "shoot": 40, "edit": 60, "design": 60, "review": 80,
                      "ready": 90, "published": 100}

    project = models.ForeignKey(Project, verbose_name="Loyiha", on_delete=models.CASCADE, related_name="posts")
    title = models.CharField("Sarlavha", max_length=200)
    platform = models.CharField("Platforma", max_length=20, choices=Platform.choices, default=Platform.INSTAGRAM)
    content_type = models.CharField("Turi", max_length=20, choices=Type.choices, default=Type.POST)
    caption = models.TextField("Matn", blank=True)
    media_url = models.URLField("Media havolasi", blank=True)
    publish_at = models.DateTimeField("E'lon vaqti", null=True, blank=True)
    status = models.CharField("Holat", max_length=20, choices=Status.choices, default=Status.IDEA)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="SMM (mas'ul)", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="posts",
    )
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Video operator", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="shoot_posts",
    )
    editor = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Montajor", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="edit_posts",
    )
    designer = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Dizayner", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="design_posts",
    )
    script = models.TextField("Ssenariy", blank=True)
    shoot_at = models.DateTimeField("Syomka vaqti", null=True, blank=True)
    edit_deadline = models.DateField("Montaj muddati", null=True, blank=True)
    review_note = models.TextField("Tasdiq izohi", blank=True)
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

    @property
    def responsible(self):
        """Hozirgi bosqichda navbat kimda."""
        st = self.Status
        return {
            st.SHOOT: self.operator, st.EDIT: self.editor, st.DESIGN: self.designer,
            st.REVIEW: self.project.manager or self.assignee,
        }.get(self.status, self.assignee)

    @property
    def deadline(self):
        """Joriy bosqich muddati (sana)."""
        if self.status == self.Status.SHOOT and self.shoot_at:
            return timezone.localtime(self.shoot_at).date()
        if self.status in (self.Status.EDIT, self.Status.DESIGN) and self.edit_deadline:
            return self.edit_deadline
        return timezone.localtime(self.publish_at).date() if self.publish_at else None

    @property
    def late_days(self):
        d = self.deadline
        if not d or self.status == self.Status.PUBLISHED:
            return 0
        return max(0, (timezone.localdate() - d).days)


class ClientReport(models.Model):
    """Mijozga oylik hisobot: qamrov, obunachilar, eng yaxshi kontent, reklama natijasi, xulosa."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Qoralama"
        READY = "ready", "Tayyor"
        SENT = "sent", "Yuborilgan"

    project = models.ForeignKey(Project, verbose_name="Loyiha", on_delete=models.CASCADE, related_name="reports")
    month = models.DateField("Oy (1-sana)")
    status = models.CharField("Holat", max_length=10, choices=Status.choices, default=Status.DRAFT)
    reach = models.PositiveIntegerField("Qamrov", default=0)
    new_followers = models.IntegerField("Yangi obunachilar", default=0)
    posts_planned = models.PositiveIntegerField("Rejadagi nashrlar", default=0)
    posts_published = models.PositiveIntegerField("Nashr qilingan", default=0)
    weekly_reach = models.JSONField("Haftalik qamrov", default=list, blank=True)
    top_content = models.JSONField("Eng yaxshi kontent", default=list, blank=True)
    ad_spend = models.DecimalField("Reklamaga sarflandi", max_digits=14, decimal_places=2, default=0)
    ad_leads = models.PositiveIntegerField("Reklamadan lidlar", default=0)
    campaigns = models.JSONField("Reklama kampaniyalari", default=list, blank=True)
    summary = models.TextField("Xulosa", blank=True)
    next_plan = models.TextField("Keyingi oy rejasi", blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    sent_at = models.DateTimeField("Yuborilgan vaqt", null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Mijoz hisoboti"
        verbose_name_plural = "Mijoz hisobotlari"
        unique_together = [("project", "month")]
        ordering = ["-month", "project__name"]

    def __str__(self):
        return f"{self.project} — {self.month:%Y-%m}"

    def fill_auto(self):
        """Kontent va reklama ma'lumotlaridan raqamlarni avtomatik to'ldirish."""
        from calendar import monthrange
        from datetime import date

        from django.db.models import Sum

        from apps.finance.models import AdSpend

        last = date(self.month.year, self.month.month, monthrange(self.month.year, self.month.month)[1])
        posts = ContentPost.objects.filter(project=self.project, publish_at__date__range=(self.month, last))
        published = posts.filter(status=ContentPost.Status.PUBLISHED)
        self.posts_planned = posts.count()
        self.posts_published = published.count()
        self.reach = published.aggregate(s=Sum("reach"))["s"] or 0
        weeks = [0, 0, 0, 0]
        for p in published.only("publish_at", "reach"):
            weeks[min(3, (timezone.localtime(p.publish_at).day - 1) // 7)] += p.reach
        self.weekly_reach = weeks
        self.top_content = [
            {"title": p.title, "reach": p.reach, "type": p.get_content_type_display()}
            for p in published.order_by("-reach")[:3]
        ]
        ads = AdSpend.objects.filter(project=self.project, date__range=(self.month, last))
        self.ad_spend = ads.aggregate(s=Sum("amount"))["s"] or 0
        self.ad_leads = ads.aggregate(s=Sum("leads"))["s"] or 0
        self.campaigns = [
            {"name": AdSpend.Platform(r["platform"]).label, "spend": float(r["spend"]), "reach": r["imp"] or 0,
             "clicks": r["clicks"] or 0, "leads": r["leads"] or 0}
            for r in ads.values("platform").annotate(
                spend=Sum("amount"), imp=Sum("impressions"), clicks=Sum("clicks"), leads=Sum("leads")
            ).order_by("-spend")
        ]
