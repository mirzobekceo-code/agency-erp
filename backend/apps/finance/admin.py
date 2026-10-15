from django.contrib import admin

from .models import AdSpend, Expense, Invoice, Payment


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ["number", "client", "project", "issue_date", "due_date", "amount", "status"]
    list_filter = ["status"]
    search_fields = ["number", "client__name"]
    inlines = [PaymentInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["invoice", "date", "amount", "method"]
    list_filter = ["method"]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["date", "category", "amount", "project", "employee", "description"]
    list_filter = ["category"]


@admin.register(AdSpend)
class AdSpendAdmin(admin.ModelAdmin):
    list_display = ["date", "project", "platform", "amount", "impressions", "clicks", "leads"]
    list_filter = ["platform"]
