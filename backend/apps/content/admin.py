from django.contrib import admin

from .models import ClientReport, ContentPost


@admin.register(ContentPost)
class ContentPostAdmin(admin.ModelAdmin):
    list_display = ["title", "project", "platform", "content_type", "publish_at", "status", "assignee"]
    list_filter = ["platform", "status", "content_type"]
    search_fields = ["title", "project__name"]


@admin.register(ClientReport)
class ClientReportAdmin(admin.ModelAdmin):
    list_display = ["project", "month", "status", "reach", "posts_published", "ad_spend"]
    list_filter = ["status", "month"]
