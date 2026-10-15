from rest_framework import serializers

from .models import Client, Contract, Lead


class ClientSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    manager_name = serializers.StringRelatedField(source="manager", read_only=True)
    projects_count = serializers.IntegerField(source="projects.count", read_only=True)

    class Meta:
        model = Client
        fields = "__all__"


class LeadSerializer(serializers.ModelSerializer):
    stage_display = serializers.CharField(source="get_stage_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    assigned_to_name = serializers.StringRelatedField(source="assigned_to", read_only=True)

    class Meta:
        model = Lead
        fields = "__all__"
        read_only_fields = ["client"]


class ContractSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    client_name = serializers.StringRelatedField(source="client", read_only=True)

    class Meta:
        model = Contract
        fields = "__all__"
