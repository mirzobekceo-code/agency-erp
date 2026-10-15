from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import ManagerOrReadOnly

from .models import Client, Contract, Lead
from .serializers import ClientSerializer, ContractSerializer, LeadSerializer


class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.select_related("manager")
    serializer_class = ClientSerializer
    permission_classes = [ManagerOrReadOnly]
    filterset_fields = ["status", "manager"]
    search_fields = ["name", "contact_person", "phone", "email", "industry", "inn"]
    ordering_fields = ["name", "created_at"]


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related("assigned_to", "client")
    serializer_class = LeadSerializer
    permission_classes = [ManagerOrReadOnly]
    filterset_fields = ["stage", "source", "assigned_to"]
    search_fields = ["name", "phone", "email", "service"]
    ordering_fields = ["created_at", "expected_value"]

    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        """Lidni mijozga aylantiradi va bosqichini 'Yutildi' qiladi."""
        lead = self.get_object()
        if lead.client_id:
            return Response({"detail": "Bu lid allaqachon mijozga aylantirilgan."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            client = Client.objects.create(
                name=lead.name, phone=lead.phone, email=lead.email,
                manager=lead.assigned_to or request.user, notes=lead.notes,
            )
            lead.client = client
            lead.stage = Lead.Stage.WON
            lead.save(update_fields=["client", "stage"])
        return Response(ClientSerializer(client).data, status=status.HTTP_201_CREATED)


class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.select_related("client")
    serializer_class = ContractSerializer
    permission_classes = [ManagerOrReadOnly]
    filterset_fields = ["status", "client"]
    search_fields = ["number", "title", "client__name"]
    ordering_fields = ["start_date", "end_date", "monthly_fee"]
