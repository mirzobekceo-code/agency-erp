from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.permissions import can_see_finance
from apps.clients.models import Client, Lead
from apps.content.models import ContentPost
from apps.finance.models import AdSpend, Expense, Invoice, Payment
from apps.projects.models import Project, Task, TimeEntry

MONEY = DecimalField(max_digits=16, decimal_places=2)
ZERO = Value(Decimal("0"), output_field=MONEY)


def _sum(qs, field="amount"):
    return qs.aggregate(s=Coalesce(Sum(field), ZERO))["s"]


def _month_start(d, back=0):
    y, m = d.year, d.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def _receivables():
    open_invoices = Invoice.objects.filter(status__in=[Invoice.Status.SENT, Invoice.Status.PARTIAL])
    total = _sum(open_invoices)
    paid = _sum(Payment.objects.filter(invoice__in=open_invoices))
    return total - paid


@api_view(["GET"])
def dashboard(request):
    today = timezone.localdate()
    month_start = _month_start(today)
    user = request.user

    open_tasks = Task.objects.exclude(status=Task.Status.DONE)
    data = {
        "clients_active": Client.objects.filter(status=Client.Status.ACTIVE).count(),
        "projects_active": Project.objects.filter(status=Project.Status.ACTIVE).count(),
        "tasks_open": open_tasks.count(),
        "tasks_overdue": open_tasks.filter(due_date__lt=today).count(),
        "my_tasks": list(
            open_tasks.filter(assignee=user)
            .order_by(F("due_date").asc(nulls_last=True))
            .values("id", "title", "status", "priority", "due_date", "project__name")[:10]
        ),
        "tasks_by_status": {
            row["status"]: row["n"] for row in Task.objects.values("status").annotate(n=Count("id"))
        },
        "leads_by_stage": {
            row["stage"]: row["n"] for row in Lead.objects.values("stage").annotate(n=Count("id"))
        },
        "upcoming_posts": list(
            ContentPost.objects.filter(publish_at__date__gte=today, publish_at__date__lte=today + timedelta(days=7))
            .exclude(status=ContentPost.Status.PUBLISHED)
            .order_by("publish_at")
            .values("id", "title", "platform", "status", "publish_at", "project__name")[:10]
        ),
    }

    if can_see_finance(user):
        revenue = _sum(Payment.objects.filter(date__gte=month_start, date__lte=today))
        expenses = _sum(Expense.objects.filter(date__gte=month_start, date__lte=today))
        six_months_ago = _month_start(today, 5)
        rev_by_month = {
            r["m"].strftime("%Y-%m"): r["s"]
            for r in Payment.objects.filter(date__gte=six_months_ago)
            .annotate(m=TruncMonth("date")).values("m").annotate(s=Sum("amount"))
        }
        exp_by_month = {
            r["m"].strftime("%Y-%m"): r["s"]
            for r in Expense.objects.filter(date__gte=six_months_ago)
            .annotate(m=TruncMonth("date")).values("m").annotate(s=Sum("amount"))
        }
        months = [_month_start(today, i).strftime("%Y-%m") for i in range(5, -1, -1)]
        data["finance"] = {
            "revenue_month": revenue,
            "expenses_month": expenses,
            "profit_month": revenue - expenses,
            "receivables": _receivables(),
            "overdue_invoices": Invoice.objects.filter(
                status__in=[Invoice.Status.SENT, Invoice.Status.PARTIAL], due_date__lt=today
            ).count(),
            "by_month": [
                {
                    "month": m,
                    "revenue": rev_by_month.get(m, Decimal("0")),
                    "expenses": exp_by_month.get(m, Decimal("0")),
                }
                for m in months
            ],
        }
    return Response(data)


def _parse_period(request):
    today = timezone.localdate()
    try:
        start = date.fromisoformat(request.query_params.get("from", ""))
    except ValueError:
        start = _month_start(today)
    try:
        end = date.fromisoformat(request.query_params.get("to", ""))
    except ValueError:
        end = today
    return start, end


@api_view(["GET"])
def project_report(request, pk):
    """Loyiha bo'yicha hisobot: vazifalar, vaqt, reklama ko'rsatkichlari va moliya."""
    project = get_object_or_404(Project.objects.select_related("client"), pk=pk)
    start, end = _parse_period(request)

    tasks = project.tasks.all()
    hours = TimeEntry.objects.filter(task__project=project, date__range=(start, end))
    ads = AdSpend.objects.filter(project=project, date__range=(start, end))
    ad_tot = ads.aggregate(
        amount=Coalesce(Sum("amount"), ZERO),
        impressions=Coalesce(Sum("impressions"), 0),
        clicks=Coalesce(Sum("clicks"), 0),
        leads=Coalesce(Sum("leads"), 0),
    )
    posts = project.posts.filter(publish_at__date__range=(start, end))

    data = {
        "project": {"id": project.pk, "name": project.name, "client": project.client.name,
                    "status": project.get_status_display(), "service": project.get_service_display()},
        "period": {"from": start, "to": end},
        "tasks": {
            "total": tasks.count(),
            "done": tasks.filter(status=Task.Status.DONE).count(),
            "overdue": tasks.exclude(status=Task.Status.DONE).filter(due_date__lt=timezone.localdate()).count(),
        },
        "hours": {
            "total": _sum(hours, "hours"),
            "by_user": list(
                hours.values(name=F("user__first_name"), surname=F("user__last_name"))
                .annotate(hours=Sum("hours")).order_by("-hours")
            ),
        },
        "ads": {
            **ad_tot,
            "ctr": round(ad_tot["clicks"] / ad_tot["impressions"] * 100, 2) if ad_tot["impressions"] else None,
            "cpc": round(ad_tot["amount"] / ad_tot["clicks"], 2) if ad_tot["clicks"] else None,
            "cpl": round(ad_tot["amount"] / ad_tot["leads"], 2) if ad_tot["leads"] else None,
            "by_platform": list(
                ads.values("platform").annotate(
                    amount=Sum("amount"), clicks=Sum("clicks"), leads=Sum("leads"), impressions=Sum("impressions")
                )
            ),
        },
        "content": {
            "planned": posts.count(),
            "published": posts.filter(status=ContentPost.Status.PUBLISHED).count(),
            "reach": posts.aggregate(s=Coalesce(Sum("reach"), 0))["s"],
            "engagement": posts.aggregate(s=Coalesce(Sum("engagement"), 0))["s"],
        },
    }
    if can_see_finance(request.user):
        invoiced = _sum(project.invoices.filter(issue_date__range=(start, end)).exclude(status=Invoice.Status.CANCELLED))
        paid = _sum(Payment.objects.filter(invoice__project=project, date__range=(start, end)))
        expenses = _sum(project.expenses.filter(date__range=(start, end)))
        data["finance"] = {
            "budget": project.budget,
            "invoiced": invoiced,
            "paid": paid,
            "expenses": expenses,
            "profit": paid - expenses,
        }
    return Response(data)


@api_view(["GET"])
def finance_report(request):
    """Davr bo'yicha daromad/xarajat: mijozlar va turkumlar kesimida."""
    if not can_see_finance(request.user):
        raise PermissionDenied()
    start, end = _parse_period(request)
    payments = Payment.objects.filter(date__range=(start, end))
    expenses = Expense.objects.filter(date__range=(start, end))
    revenue = _sum(payments)
    total_exp = _sum(expenses)
    return Response({
        "period": {"from": start, "to": end},
        "revenue": revenue,
        "expenses": total_exp,
        "profit": revenue - total_exp,
        "receivables": _receivables(),
        "revenue_by_client": list(
            payments.values(client=F("invoice__client__name")).annotate(amount=Sum("amount")).order_by("-amount")
        ),
        "expenses_by_category": [
            {"category": r["category"], "label": Expense.Category(r["category"]).label, "amount": r["amount"]}
            for r in expenses.values("category").annotate(amount=Sum("amount")).order_by("-amount")
        ],
        "salary_by_employee": list(
            expenses.filter(category=Expense.Category.SALARY, employee__isnull=False)
            .values(name=F("employee__first_name"), surname=F("employee__last_name"))
            .annotate(amount=Sum("amount")).order_by("-amount")
        ),
        "top_projects": list(
            Project.objects.annotate(
                paid=Coalesce(Sum("invoices__payments__amount", filter=Q(invoices__payments__date__range=(start, end))), ZERO)
            ).filter(paid__gt=0).order_by("-paid").values("id", "name", "paid", client_name=F("client__name"))[:10]
        ),
    })
