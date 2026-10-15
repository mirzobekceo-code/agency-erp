from rest_framework import serializers

from .models import Project, Task, TaskComment, TimeEntry


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
    spent_hours = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)

    class Meta:
        model = Task
        fields = "__all__"
        read_only_fields = ["created_by"]


class TimeEntrySerializer(serializers.ModelSerializer):
    task_title = serializers.StringRelatedField(source="task", read_only=True)
    user_name = serializers.StringRelatedField(source="user", read_only=True)

    class Meta:
        model = TimeEntry
        fields = "__all__"
        read_only_fields = ["user"]
