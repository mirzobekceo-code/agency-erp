from rest_framework import serializers

from .models import ContentPost


class ContentPostSerializer(serializers.ModelSerializer):
    platform_display = serializers.CharField(source="get_platform_display", read_only=True)
    content_type_display = serializers.CharField(source="get_content_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    client_name = serializers.CharField(source="project.client.name", read_only=True)
    assignee_name = serializers.StringRelatedField(source="assignee", read_only=True)

    class Meta:
        model = ContentPost
        fields = "__all__"
