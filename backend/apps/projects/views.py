from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from apps.accounts.permissions import ManagerOrReadOnly, has_role
from apps.team import telegram

from .models import Project, Task, TaskComment, TimeEntry
from .serializers import ProjectSerializer, TaskCommentSerializer, TaskSerializer, TimeEntrySerializer


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [ManagerOrReadOnly]
    filterset_fields = ["status", "service", "client", "manager", "members"]
    search_fields = ["name", "client__name", "description"]
    ordering_fields = ["created_at", "deadline", "budget"]

    def get_queryset(self):
        return (
            Project.objects.select_related("client", "manager")
            .prefetch_related("members")
            .annotate(
                tasks_total=Count("tasks", distinct=True),
                tasks_done=Count("tasks", filter=Q(tasks__status=Task.Status.DONE), distinct=True),
            )
        )


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    filterset_fields = {
        "status": ["exact", "in"],
        "priority": ["exact"],
        "project": ["exact"],
        "assignee": ["exact"],
        "due_date": ["lte", "gte"],
    }
    search_fields = ["title", "description", "project__name"]
    ordering_fields = ["due_date", "priority", "created_at", "updated_at"]

    def get_queryset(self):
        return Task.objects.select_related("project", "assignee").annotate(
            spent_hours=Coalesce(Sum("time_entries__hours"), Value(0), output_field=Task._meta.get_field("estimated_hours"))
        )

    def perform_create(self, serializer):
        task = serializer.save(created_by=self.request.user)
        telegram.task_created(task, self.request.user)

    def perform_update(self, serializer):
        old_status, old_assignee = serializer.instance.status, serializer.instance.assignee_id
        task = serializer.save()
        telegram.task_updated(task, self.request.user, old_status, old_assignee)

    def perform_destroy(self, instance):
        if not (has_role(self.request.user, "admin", "manager") or instance.created_by_id == self.request.user.pk):
            raise PermissionDenied("Vazifani faqat menejer yoki uni yaratgan xodim o'chira oladi.")
        instance.delete()


class TaskCommentViewSet(viewsets.ModelViewSet):
    serializer_class = TaskCommentSerializer
    queryset = TaskComment.objects.select_related("author")
    filterset_fields = ["task"]

    def perform_create(self, serializer):
        comment = serializer.save(author=self.request.user)
        telegram.task_commented(comment)

    def perform_update(self, serializer):
        if serializer.instance.author_id != self.request.user.pk:
            raise PermissionDenied("Faqat o'z izohingizni tahrirlay olasiz.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.author_id != self.request.user.pk and not has_role(self.request.user, "admin"):
            raise PermissionDenied("Faqat o'z izohingizni o'chira olasiz.")
        instance.delete()


class TimeEntryViewSet(viewsets.ModelViewSet):
    serializer_class = TimeEntrySerializer
    filterset_fields = {"task": ["exact"], "user": ["exact"], "task__project": ["exact"], "date": ["gte", "lte"]}
    ordering_fields = ["date", "hours"]

    def get_queryset(self):
        qs = TimeEntry.objects.select_related("task", "user")
        # Mutaxassis faqat o'z ish vaqtini ko'radi.
        if not has_role(self.request.user, "admin", "manager", "accountant"):
            qs = qs.filter(user=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def _check_owner(self, instance):
        if instance.user_id != self.request.user.pk and not has_role(self.request.user, "admin"):
            raise PermissionDenied("Faqat o'z ish vaqtingizni o'zgartira olasiz.")

    def perform_update(self, serializer):
        self._check_owner(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_owner(instance)
        instance.delete()
