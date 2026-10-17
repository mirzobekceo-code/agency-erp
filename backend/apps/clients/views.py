from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
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
    ordering_fields = ["created_at", "expected_value", "next_action_date"]

    @action(detail=False)
    def stats(self, request):
        """CRM ko'rsatkichlari: voronkadagi summa, konversiya, shu oy yangi so'rovlar, bosqichlar."""
        qs = self.filter_queryset(self.get_queryset())
        today = timezone.localdate()
        active = qs.exclude(stage__in=[Lead.Stage.WON, Lead.Stage.LOST])
        won, lost = qs.filter(stage=Lead.Stage.WON).count(), qs.filter(stage=Lead.Stage.LOST).count()
        total = qs.count()
        stages = {
            r["stage"]: {"count": r["n"], "sum": r["s"] or Decimal("0")}
            for r in qs.values("stage").annotate(n=Count("id"), s=Sum("expected_value"))
        }
        return Response({
            "pipeline_sum": active.aggregate(s=Sum("expected_value"))["s"] or Decimal("0"),
            "active": active.count(),
            "conversion": round(won / total * 100) if total else 0,
            "won": won, "lost": lost,
            "new_this_month": qs.filter(created_at__date__gte=today.replace(day=1)).count(),
            "follow_up": active.filter(next_action_date__lte=today).count(),
            "stages": stages,
        })

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
