from django.contrib import admin

from .models import AgencySettings, Attendance, Note, NoteMessage, PayrollEntry

admin.site.register(AgencySettings)


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ["date", "user", "status", "check_in", "check_out", "fine"]
    list_filter = ["status", "user"]
    date_hierarchy = "date"


@admin.register(PayrollEntry)
class PayrollEntryAdmin(admin.ModelAdmin):
    list_display = ["pay_date", "user", "base_salary", "fines", "bonus", "paid_amount"]
    list_filter = ["pay_date"]


class NoteMessageInline(admin.TabularInline):
    model = NoteMessage
    extra = 0


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ["title", "kind", "author", "shared", "updated_at"]
    inlines = [NoteMessageInline]
