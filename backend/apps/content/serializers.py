from rest_framework import serializers

from .models import ClientReport, ContentPost


class ContentPostSerializer(serializers.ModelSerializer):
    platform_display = serializers.CharField(source="get_platform_display", read_only=True)
    content_type_display = serializers.CharField(source="get_content_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    assignee_name = serializers.StringRelatedField(source="assignee", read_only=True)
    operator_name = serializers.StringRelatedField(source="operator", read_only=True)
    editor_name = serializers.StringRelatedField(source="editor", read_only=True)
    designer_name = serializers.StringRelatedField(source="designer", read_only=True)
    responsible_id = serializers.SerializerMethodField()
    responsible_name = serializers.SerializerMethodField()
    responsible_job = serializers.SerializerMethodField()
    deadline = serializers.DateField(read_only=True)
    late_days = serializers.IntegerField(read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = ContentPost
        fields = "__all__"

    def get_responsible_id(self, obj):
        r = obj.responsible
        return r.pk if r else None

    def get_responsible_name(self, obj):
        r = obj.responsible
        return str(r) if r else None

    def get_responsible_job(self, obj):
        r = obj.responsible
        return r.get_job_display() if r else None

    def get_progress(self, obj):
        return ContentPost.STAGE_PROGRESS.get(obj.status, 0)


class ClientReportSerializer(serializers.ModelSerializer):
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ClientReport
        fields = "__all__"
        read_only_fields = ["created_by", "sent_at"]
