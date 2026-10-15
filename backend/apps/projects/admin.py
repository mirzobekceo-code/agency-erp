from django.contrib import admin

from .models import Project, Task, TaskComment, TimeEntry


class TaskInline(admin.TabularInline):
    model = Task
    extra = 0
    fields = ["title", "status", "priority", "assignee", "due_date"]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["name", "client", "service", "status", "deadline", "budget", "manager"]
    list_filter = ["status", "service"]
    search_fields = ["name", "client__name"]
    filter_horizontal = ["members"]
    inlines = [TaskInline]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "project", "status", "priority", "assignee", "due_date"]
    list_filter = ["status", "priority"]
    search_fields = ["title", "project__name"]


admin.site.register(TaskComment)


@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ["task", "user", "date", "hours"]
    list_filter = ["user"]
