from django.contrib import admin

from .models import Client, Contract, Lead


class ContractInline(admin.TabularInline):
    model = Contract
    extra = 0


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ["name", "contact_person", "phone", "status", "manager"]
    list_filter = ["status", "manager"]
    search_fields = ["name", "contact_person", "phone", "inn"]
    inlines = [ContractInline]


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "source", "stage", "expected_value", "assigned_to", "created_at"]
    list_filter = ["stage", "source"]
    search_fields = ["name", "phone"]


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = ["number", "client", "start_date", "end_date", "monthly_fee", "status"]
    list_filter = ["status"]
    search_fields = ["number", "client__name"]
