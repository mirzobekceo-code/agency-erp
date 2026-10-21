from datetime import timedelta

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

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


# Ijrochi (vazifani bergan bo'lmasa) faqat shu maydonlarni o'zgartira oladi
ASSIGNEE_FIELDS = {"status", "checklist"}


def task_tab_q(tab, user, today, with_recent_done=False):
    """Vazifalar sahifasidagi tezkor filtrlar.

    with_recent_done: "Mening" va "Men bergan" doskasida so'nggi 7 kunda bajarilganlar ham ko'rinadi
    (hisoblagichlar esa faqat ochiq vazifalarni sanaydi).
    """
    open_ = ~Q(status=Task.Status.DONE)
    if with_recent_done:
        open_ = open_ | Q(done_at__date__gte=today - timedelta(days=7))
    return {
        "mine": Q(assignee=user) & open_,
        "due": Q(assignee=user, due_date__lte=today) & open_,
        "late": Q(due_date__lt=today) & open_,
        "approve": Q(status=Task.Status.REVIEW) & (Q(created_by=user) | Q(project__manager=user)) & ~Q(assignee=user),
        "given": Q(created_by=user) & ~Q(assignee=user) & open_,
        "done": Q(status=Task.Status.DONE),
    }.get(tab)


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    filterset_fields = {
        "status": ["exact", "in"],
        "priority": ["exact"],
        "project": ["exact", "isnull"],
        "assignee": ["exact"],
        "created_by": ["exact"],
        "due_date": ["lte", "gte"],
    }
    search_fields = ["title", "description", "project__name"]
    ordering_fields = ["due_date", "priority", "created_at", "updated_at", "done_at"]

    def get_queryset(self):
        qs = Task.objects.select_related("project", "assignee", "created_by").order_by("due_date", "-created_at").annotate(
            spent_hours=Coalesce(Sum("time_entries__hours"), Value(0), output_field=Task._meta.get_field("estimated_hours"))
        )
        tab = self.request.query_params.get("tab")
        if tab and self.action == "list":
            q = task_tab_q(tab, self.request.user, timezone.localdate(), with_recent_done=True)
            if q is not None:
                qs = qs.filter(q)
        return qs

    @action(detail=False)
    def stats(self, request):
        """Tezkor filtrlar uchun hisoblagichlar."""
        today = timezone.localdate()
        base = Task.objects.all()
        if request.query_params.get("project"):
            base = base.filter(project=request.query_params["project"])
        tabs = {k: base.filter(task_tab_q(k, request.user, today)).count()
                for k in ("mine", "due", "late", "approve", "given")}
        tabs["all"] = base.exclude(status=Task.Status.DONE).count()
        return Response(tabs)

    def perform_create(self, serializer):
        serializer.validated_data.pop("return_reason", None)
        status_ = serializer.validated_data.get("status", Task.Status.TODO)
        task = serializer.save(created_by=self.request.user,
                               done_at=timezone.now() if status_ == Task.Status.DONE else None)
        telegram.task_created(task, self.request.user)

    def perform_update(self, serializer):
        user = self.request.user
        task = serializer.instance
        data = serializer.validated_data
        reason = data.pop("return_reason", "").strip()
        supervisor = task.can_supervise(user)
        if not supervisor:
            if task.assignee_id != user.pk:
                raise PermissionDenied("Bu vazifani faqat ijrochi, uni bergan xodim yoki rahbar o'zgartira oladi.")
            extra = set(data) - ASSIGNEE_FIELDS
            if extra:
                raise PermissionDenied("Ijrochi faqat holat va qadamlarni o'zgartira oladi. "
                                       "Muddat yoki ijrochini vazifani bergan xodim o'zgartiradi.")
            # Ijrochi "Tayyor" qila olmaydi — vazifa beruvchining tasdig'iga yuboriladi
            if data.get("status") == Task.Status.DONE:
                data["status"] = Task.Status.REVIEW

        old_status, old_assignee = task.status, task.assignee_id
        old_deadline = (task.due_date, task.due_time)
        new_status = data.get("status", old_status)
        returned = supervisor and old_status == Task.Status.REVIEW and new_status in (
            Task.Status.IN_PROGRESS, Task.Status.TODO)
        extra_fields = {}
        if new_status == Task.Status.DONE and old_status != Task.Status.DONE:
            extra_fields["done_at"] = timezone.now()
        elif new_status != Task.Status.DONE:
            extra_fields["done_at"] = None
        if returned:
            extra_fields["returned_count"] = task.returned_count + 1
        # Muddat o'zgarsa — eslatma qaytadan yuboriladi
        if (data.get("due_date", task.due_date), data.get("due_time", task.due_time)) != old_deadline:
            extra_fields["reminder_sent_at"] = None
        task = serializer.save(**extra_fields)
        if returned:
            TaskComment.objects.create(task=task, author=user,
                                       text=f"↩️ Qaytarildi{': ' + reason if reason else ''}")
        telegram.task_updated(task, user, old_assignee)

    def perform_destroy(self, instance):
        if not instance.can_supervise(self.request.user):
            raise PermissionDenied("Vazifani faqat uni bergan xodim, loyiha PM'i yoki rahbar o'chira oladi.")
        instance.delete()


class TaskCommentViewSet(viewsets.ModelViewSet):
    serializer_class = TaskCommentSerializer
    queryset = TaskComment.objects.select_related("author")
    filterset_fields = ["task"]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

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
