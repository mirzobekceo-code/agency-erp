from rest_framework import serializers

from .models import Deliverable, Project, Task, TaskComment, TimeEntry


class ProjectSerializer(serializers.ModelSerializer):
    service_display = serializers.CharField(source="get_service_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    client_name = serializers.StringRelatedField(source="client", read_only=True)
    manager_name = serializers.StringRelatedField(source="manager", read_only=True)
    tasks_total = serializers.IntegerField(read_only=True)
    tasks_done = serializers.IntegerField(read_only=True)

    class Meta:
        model = Project
        fields = "__all__"


class TaskCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.StringRelatedField(source="author", read_only=True)

    class Meta:
        model = TaskComment
        fields = ["id", "task", "author", "author_name", "text", "created_at"]
        read_only_fields = ["author"]


class TaskSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    assignee_name = serializers.StringRelatedField(source="assignee", read_only=True)
    created_by_name = serializers.StringRelatedField(source="created_by", read_only=True)
    spent_hours = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True, default=0)
    steps_total = serializers.SerializerMethodField()
    steps_done = serializers.SerializerMethodField()
    can_supervise = serializers.SerializerMethodField()
    is_assignee = serializers.SerializerMethodField()
    # Faqat yozish uchun: tasdiqdan qaytarish sababi (izoh sifatida saqlanadi)
    return_reason = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Task
        fields = "__all__"
        read_only_fields = ["created_by", "done_at", "returned_count", "reminder_sent_at", "submitted_at",
                            "last_status_ask"]

    piece_info = serializers.SerializerMethodField()

    def get_piece_info(self, obj):
        """Donabay narx — faqat ijrochi, vazifa beruvchi va moliya/oylik bilan ishlovchilarga ko'rinadi."""
        from apps.accounts.permissions import has_role

        u = self._user()
        if not obj.piece_rate_id or not u:
            return None
        if not (obj.assignee_id == u.pk or obj.can_supervise(u) or has_role(u, "admin", "accountant", "hr")):
            return None
        return {"title": obj.piece_rate.title, "amount": obj.piece_rate.price * (obj.piece_qty or 1),
                "pay_mode": obj.piece_pay_mode}

    def validate(self, attrs):
        rate = attrs.get("piece_rate", getattr(self.instance, "piece_rate", None))
        assignee = attrs.get("assignee", getattr(self.instance, "assignee", None))
        if rate and (not assignee or rate.user_id != assignee.pk):
            raise serializers.ValidationError({"piece_rate": "Bu narx tanlangan ijrochiga tegishli emas."})
        return attrs

    def get_steps_total(self, obj):
        return len(obj.checklist or [])

    def get_steps_done(self, obj):
        return sum(1 for s in obj.checklist or [] if s.get("done"))

    def _user(self):
        req = self.context.get("request")
        return req.user if req else None

    def get_can_supervise(self, obj):
        u = self._user()
        return bool(u and obj.can_supervise(u))

    def get_is_assignee(self, obj):
        u = self._user()
        return bool(u and obj.assignee_id == u.pk)

    def validate_checklist(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Qadamlar ro'yxat bo'lishi kerak.")
        clean = []
        for item in value:
            if isinstance(item, str):
                item = {"text": item, "done": False}
            text = str(item.get("text", "")).strip()[:200]
            if text:
                clean.append({"text": text, "done": bool(item.get("done"))})
        return clean[:50]


class TimeEntrySerializer(serializers.ModelSerializer):
    task_title = serializers.StringRelatedField(source="task", read_only=True)
    user_name = serializers.StringRelatedField(source="user", read_only=True)

    class Meta:
        model = TimeEntry
        fields = "__all__"
        read_only_fields = ["user"]


class DeliverableSerializer(serializers.ModelSerializer):
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    responsible_name = serializers.StringRelatedField(source="responsible", read_only=True)
    done_count = serializers.IntegerField(read_only=True)
    state = serializers.SerializerMethodField()

    class Meta:
        model = Deliverable
        fields = "__all__"

    def get_state(self, obj):
        """done / late (muddat o'tdi) / behind (reja bo'yicha orqada) / ok."""
        from django.utils import timezone

        done = obj.done_count
        if done >= obj.quantity:
            return "done"
        today = timezone.localdate()
        if obj.due_date and obj.due_date < today:
            return "late"
        if obj.due_date and obj.period_start and obj.period_start < obj.due_date:
            total = (obj.due_date - obj.period_start).days
            passed = min(max((today - obj.period_start).days, 0), total)
            if done < obj.quantity * passed / total - 0.5:
                return "behind"
        elif obj.due_date and (obj.due_date - today).days <= 3:
            return "behind"
        return "ok"
