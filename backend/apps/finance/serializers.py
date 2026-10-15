from django.db.models import Max
from django.utils import timezone
from rest_framework import serializers

from .models import AdSpend, Expense, Invoice, Payment


def next_invoice_number():
    year = timezone.localdate().year
    prefix = f"INV-{year}-"
    last = Invoice.objects.filter(number__startswith=prefix).aggregate(m=Max("number"))["m"]
    seq = int(last.rsplit("-", 1)[1]) + 1 if last and last.rsplit("-", 1)[1].isdigit() else 1
    return f"{prefix}{seq:04d}"


class InvoiceSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False, allow_blank=True, max_length=50)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    client_name = serializers.StringRelatedField(source="client", read_only=True)
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = "__all__"

    def validate(self, attrs):
        project = attrs.get("project", getattr(self.instance, "project", None))
        client = attrs.get("client", getattr(self.instance, "client", None))
        if project and client and project.client_id != client.pk:
            raise serializers.ValidationError({"project": "Loyiha tanlangan mijozga tegishli emas."})
        if attrs.get("number") == "":
            attrs.pop("number")
        number = attrs.get("number")
        if number and Invoice.objects.exclude(pk=getattr(self.instance, "pk", None)).filter(number=number).exists():
            raise serializers.ValidationError({"number": "Bu raqamli hisob-faktura mavjud."})
        return attrs

    def create(self, validated_data):
        validated_data.setdefault("number", next_invoice_number())
        return super().create(validated_data)


class PaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    client_name = serializers.CharField(source="invoice.client.name", read_only=True)

    class Meta:
        model = Payment
        fields = "__all__"

    def validate(self, attrs):
        invoice = attrs.get("invoice", getattr(self.instance, "invoice", None))
        amount = attrs.get("amount", getattr(self.instance, "amount", None))
        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"amount": "Summa musbat bo'lishi kerak."})
        if invoice.status == Invoice.Status.CANCELLED:
            raise serializers.ValidationError({"invoice": "Bekor qilingan hisob-fakturaga to'lov qabul qilinmaydi."})
        already = invoice.paid_amount - (self.instance.amount if self.instance else 0)
        if already + amount > invoice.amount:
            raise serializers.ValidationError(
                {"amount": f"To'lov qoldiqdan oshib ketdi. Qoldiq: {invoice.amount - already}"}
            )
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    employee_name = serializers.StringRelatedField(source="employee", read_only=True)

    class Meta:
        model = Expense
        fields = "__all__"


class AdSpendSerializer(serializers.ModelSerializer):
    platform_display = serializers.CharField(source="get_platform_display", read_only=True)
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    ctr = serializers.SerializerMethodField()
    cpl = serializers.SerializerMethodField()

    class Meta:
        model = AdSpend
        fields = "__all__"

    def get_ctr(self, obj):
        return round(obj.clicks / obj.impressions * 100, 2) if obj.impressions else None

    def get_cpl(self, obj):
        return round(obj.amount / obj.leads, 2) if obj.leads else None
