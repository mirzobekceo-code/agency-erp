from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import FinancePermission
from apps.clients.models import Client
from apps.projects.models import Project

from .models import AdSpend, Expense, Invoice, Payment
from .serializers import (
    AdSpendSerializer, ExpenseSerializer, InvoiceSerializer, PaymentSerializer, next_invoice_number,
)


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("client", "project").prefetch_related("payments")
    serializer_class = InvoiceSerializer
    permission_classes = [FinancePermission]
    filterset_fields = {"status": ["exact", "in"], "client": ["exact"], "project": ["exact"],
                        "issue_date": ["gte", "lte"]}
    search_fields = ["number", "client__name", "notes"]
    ordering_fields = ["issue_date", "due_date", "amount"]

    def perform_update(self, serializer):
        invoice = serializer.save()
        invoice.refresh_status()


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related("invoice__client")
    serializer_class = PaymentSerializer
    permission_classes = [FinancePermission]
    filterset_fields = {"invoice": ["exact"], "invoice__client": ["exact"], "method": ["exact"],
                        "date": ["gte", "lte"]}
    search_fields = ["invoice__number", "invoice__client__name", "note"]
    ordering_fields = ["date", "amount"]

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save().invoice.refresh_status()

    @transaction.atomic
    def perform_update(self, serializer):
        old_invoice = serializer.instance.invoice
        payment = serializer.save()
        payment.invoice.refresh_status()
        if old_invoice.pk != payment.invoice_id:
            old_invoice.refresh_status()

    @transaction.atomic
    def perform_destroy(self, instance):
        invoice = instance.invoice
        instance.delete()
        invoice.refresh_status()


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.select_related("project", "employee")
    serializer_class = ExpenseSerializer
    permission_classes = [FinancePermission]
    filterset_fields = {"category": ["exact"], "project": ["exact"], "employee": ["exact"],
                        "date": ["gte", "lte"]}
    search_fields = ["description", "project__name"]
    ordering_fields = ["date", "amount"]


class AdSpendViewSet(viewsets.ModelViewSet):
    queryset = AdSpend.objects.select_related("project")
    serializer_class = AdSpendSerializer
    permission_classes = [FinancePermission]
    filterset_fields = {"project": ["exact"], "platform": ["exact"], "date": ["gte", "lte"]}
    ordering_fields = ["date", "amount"]


@api_view(["POST"])
@permission_classes([FinancePermission])
def receive_payment(request):
    """Mijozdan to'lov qabul qilish.

    invoice berilsa — o'sha hisob-fakturaga to'lov yoziladi; berilmasa — shu summaga yangi
    hisob-faktura yaratilib, darhol to'langan qilinadi (masalan, oldindan to'lov yoki naqd pul).
    """
    d = request.data
    try:
        amount = Decimal(str(d.get("amount")))
    except (InvalidOperation, TypeError):
        raise ValidationError({"amount": "Summani kiriting."})
    if amount <= 0:
        raise ValidationError({"amount": "Summa musbat bo'lishi kerak."})
    pay_date = d.get("date") or timezone.localdate()
    method = d.get("method") or Payment.Method.TRANSFER
    note = d.get("note", "")

    with transaction.atomic():
        if d.get("invoice"):
            invoice = get_object_or_404(Invoice, pk=d["invoice"])
        else:
            if not d.get("client"):
                raise ValidationError({"client": "Mijozni yoki hisob-fakturani tanlang."})
            client = get_object_or_404(Client, pk=d["client"])
            project = None
            if d.get("project"):
                project = get_object_or_404(Project, pk=d["project"], client=client)
            invoice = Invoice.objects.create(
                client=client, project=project, number=next_invoice_number(), amount=amount,
                issue_date=pay_date, due_date=pay_date, status=Invoice.Status.SENT, notes=note,
            )
        ser = PaymentSerializer(data={"invoice": invoice.pk, "amount": amount, "date": pay_date,
                                      "method": method, "note": note})
        ser.is_valid(raise_exception=True)
        ser.save()
        invoice.refresh_status()
    return Response(ser.data, status=status.HTTP_201_CREATED)
