from django.db import transaction
from rest_framework import viewsets

from apps.accounts.permissions import FinancePermission

from .models import AdSpend, Expense, Invoice, Payment
from .serializers import AdSpendSerializer, ExpenseSerializer, InvoiceSerializer, PaymentSerializer


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
