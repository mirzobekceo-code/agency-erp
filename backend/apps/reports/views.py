from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.permissions import can_see_finance, sees_all_leads
from apps.clients.models import Client, Lead
from apps.content.models import ContentPost
from apps.finance.models import AdSpend, Expense, Invoice, Payment
from apps.projects.models import Project, Task, TimeEntry
from apps.team.models import AgencySettings, Attendance, PayrollEntry
from apps.team.views import can_mark_attendance, generate_payroll, tracked_users

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


def _my_projects(user):
    """Rahbar hamma loyihani, qolganlar o'zi menejer yoki a'zo bo'lganlarini ko'radi."""
    qs = Project.objects.all()
    if not user.is_admin:
        qs = qs.filter(Q(manager=user) | Q(members=user)).distinct()
    return qs


def _visible_leads(user):
    if sees_all_leads(user):
        return Lead.objects.all()
    return Lead.objects.filter(assigned_to=user)


@api_view(["GET"])
def dashboard(request):
    """Shaxsiy bosh sahifa: faqat foydalanuvchining o'z vazifalari, davomati, loyihalari va nashrlari."""
    today = timezone.localdate()
    user = request.user
    s = AgencySettings.get()

    projects = _my_projects(user).filter(status=Project.Status.ACTIVE)
    my_open = Task.objects.filter(assignee=user).exclude(status=Task.Status.DONE)
    due_today = Task.objects.filter(assignee=user, due_date=today)
    leads = _visible_leads(user)
    active_leads = leads.exclude(stage__in=[Lead.Stage.WON, Lead.Stage.LOST])

    posts = ContentPost.objects.filter(publish_at__date__gte=today, publish_at__date__lte=today + timedelta(days=7))
    if not user.is_admin:
        posts = posts.filter(Q(assignee=user) | Q(project__in=_my_projects(user))).distinct()

    att = Attendance.objects.filter(user=user, date=today).first()
    attendance = None
    if user.track_attendance:
        attendance = {
            "workday": s.is_workday(today),
            "status": att.status if att else "",
            "status_display": att.get_status_display() if att else "",
            "check_in": att.check_in if att else None,
            "check_out": att.check_out if att else None,
            "late": bool(att and att.status == "present" and att.check_in and att.check_in > s.work_start),
            "fine": att.fine if att else Decimal("0"),
            "work_start": s.work_start,
        }

    data = {
        "projects": {
            "active": projects.count(),
            "deadline_soon": projects.filter(deadline__gte=today, deadline__lte=today + timedelta(days=7)).count(),
        },
        "today_tasks": {
            "total": due_today.count(),
            "done": due_today.filter(status=Task.Status.DONE).count(),
            "overdue": my_open.filter(due_date__lt=today).count(),
        },
        "leads": {
            "new": leads.filter(stage=Lead.Stage.NEW).count(),
            "follow_up": active_leads.filter(next_action_date__lte=today).count(),
            "visible": sees_all_leads(user) or leads.exists(),
        },
        "attendance": attendance,
        "my_tasks": list(
            my_open.order_by(F("due_date").asc(nulls_last=True), "-priority")
            .values("id", "title", "status", "priority", "due_date", "project__name")[:8]
        ),
        "upcoming_posts": list(
            posts.order_by("publish_at")
            .values("id", "title", "platform", "content_type", "status", "publish_at", "project__name")[:8]
        ),
        "project_progress": [
            {"id": p.id, "name": p.name, "total": p.t, "done": p.d}
            for p in projects.annotate(
                t=Count("tasks", distinct=True),
                d=Count("tasks", filter=Q(tasks__status=Task.Status.DONE), distinct=True),
            ).order_by("deadline")[:8]
        ],
        "alerts": _alerts(user, today),
    }
    return Response(data)


def _parse_month(request, today):
    try:
        y, m = map(int, request.query_params.get("month", "").split("-"))
        return date(y, m, 1)
    except ValueError:
        return today.replace(day=1)


@api_view(["GET"])
def finance_overview(request):
    """Moliya: umumiy holat. Tanlangan oy bo'yicha pul oqimi va joriy qarzlar."""
    if not can_see_finance(request.user):
        raise PermissionDenied()
    today = timezone.localdate()
    first = _parse_month(request, today)
    nxt = _month_start(first + timedelta(days=32))
    payments = Payment.objects.filter(date__gte=first, date__lt=nxt)
    expenses = Expense.objects.filter(date__gte=first, date__lt=nxt)

    revenue = _sum(payments)
    salaries = _sum(expenses.filter(category=Expense.Category.SALARY))
    other = _sum(expenses.exclude(category=Expense.Category.SALARY))
    profit = revenue - salaries - other

    s = AgencySettings.get()
    pay, start, end = s.pay_period(today)
    generate_payroll(pay, start, end)
    # Hali to'lanmagan oyliklar (kelajakdagi davrlar hisobga olinmaydi)
    payroll_left = sum((max(e.balance, Decimal("0")) for e in PayrollEntry.objects.filter(pay_date__lte=today)),
                       Decimal("0"))

    # Oxirgi 6 oy: kirim / chiqim
    six = _month_start(first, 5)
    def by_month(qs):
        return {r["m"].strftime("%Y-%m"): r["s"] for r in
                qs.annotate(m=TruncMonth("date")).values("m").annotate(s=Sum("amount"))}
    rin = by_month(Payment.objects.filter(date__gte=six, date__lt=nxt))
    rout = by_month(Expense.objects.filter(date__gte=six, date__lt=nxt))
    months = [_month_start(first, i).strftime("%Y-%m") for i in range(5, -1, -1)]

    open_invoices = (
        Invoice.objects.filter(status__in=[Invoice.Status.SENT, Invoice.Status.PARTIAL])
        .select_related("client", "project").prefetch_related("payments").order_by(F("due_date").asc(nulls_last=True))
    )
    expected = [
        {"id": i.id, "number": i.number, "client": i.client.name, "project": i.project.name if i.project else "",
         "due_date": i.due_date, "balance": i.balance, "overdue": i.is_overdue}
        for i in open_invoices[:8]
    ]

    return Response({
        "month": first.strftime("%Y-%m"),
        "revenue": revenue,
        "salaries": salaries,
        "other_expenses": other,
        "profit": profit,
        "margin": round(profit / revenue * 100) if revenue else None,
        "receivables": _receivables(),
        "payroll_left": payroll_left,
        "payroll_pay_date": pay,
        "cash_flow": [{"month": m, "revenue": rin.get(m, Decimal("0")), "expenses": rout.get(m, Decimal("0"))}
                      for m in months],
        "expense_breakdown": [
            {"category": r["category"], "label": Expense.Category(r["category"]).label, "amount": r["amount"]}
            for r in expenses.values("category").annotate(amount=Sum("amount")).order_by("-amount")
        ],
        "revenue_by_project": list(
            payments.values(name=Coalesce(F("invoice__project__name"), F("invoice__client__name")))
            .annotate(amount=Sum("amount")).order_by("-amount")[:8]
        ),
        "expected_payments": expected,
        "recent": _recent_transactions(first, nxt),
    })


def _recent_transactions(first, nxt):
    rows = [
        {"kind": "in", "date": p.date, "amount": p.amount, "title": p.invoice.client.name,
         "sub": f"{p.get_method_display()} · {p.invoice.number}"}
        for p in Payment.objects.filter(date__gte=first, date__lt=nxt).select_related("invoice__client")[:10]
    ] + [
        {"kind": "out", "date": e.date, "amount": e.amount, "title": e.get_category_display(),
         "sub": e.description or (str(e.employee) if e.employee else "")}
        for e in Expense.objects.filter(date__gte=first, date__lt=nxt).select_related("employee")[:10]
    ]
    return sorted(rows, key=lambda r: r["date"], reverse=True)[:10]


MONTHS_UZ = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr",
             "noyabr", "dekabr"]


def _alerts(user, today):
    """Bosh sahifadagi ogohlantirishlar: davomat, oylik kuni, muddati o'tgan vazifalar."""
    s = AgencySettings.get()
    alerts = []
    if can_mark_attendance(user) and s.is_workday(today):
        marked = Attendance.objects.filter(date=today).values_list("user_id", flat=True)
        n = tracked_users().exclude(pk__in=marked).count()
        if n:
            alerts.append({"tone": "warn", "icon": "clock", "link": "/attendance",
                           "action": "Belgilash", "text": f"Bugungi davomat: {n} xodim hali belgilanmagan"})
    if user.is_admin or user.role in ("accountant", "hr"):
        pay, start, end = s.pay_period(today)
        days_ago = (today - pay).days
        if days_ago <= 7:
            generate_payroll(pay, start, end)
            left = sum((e.balance for e in PayrollEntry.objects.filter(pay_date=pay)), Decimal("0"))
            if left > 0:
                when = "bugun" if days_ago == 0 else f"{days_ago} kun oldin o'tdi"
                alerts.append({"tone": "bad", "icon": "calendar", "link": "/payroll", "action": "Vedomost",
                               "text": f"Oylik kuni ({pay.day}-{MONTHS_UZ[pay.month - 1]}) {when} — "
                                       f"xodimlarga {left:,.0f} so'm to'lanishi kerak".replace(",", " ")})
        nxt = pay.replace(year=pay.year + (pay.month == 12), month=pay.month % 12 + 1)
        if 0 < (nxt - today).days <= 3:
            alerts.append({"tone": "info", "icon": "calendar", "link": "/payroll", "action": "Vedomost",
                           "text": f"Oylik kuni yaqinlashmoqda: {nxt.day}-{MONTHS_UZ[nxt.month - 1]}"})
    n = Task.objects.filter(assignee=user, due_date__lt=today).exclude(status=Task.Status.DONE).count()
    if n:
        alerts.append({"tone": "bad", "icon": "alarm", "link": "/tasks?overdue=1", "action": "Ko'rish",
                       "text": f"Sizning {n} ta vazifangizning muddati o'tib ketgan"})
    return alerts


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
