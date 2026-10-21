from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS, AllowAny, BasePermission
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import PayrollPermission, has_role
from apps.finance.models import Expense

from .models import AgencySettings, Attendance, Note, NoteMessage, PayrollEntry
from .serializers import (
    AgencySettingsSerializer, AttendanceRowSerializer, NoteMessageSerializer, NoteSerializer, PayrollEntrySerializer,
)


def _parse_date(value, default=None):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return default


# ---------- Sozlamalar ----------

class AdminWriteOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS or has_role(request.user, "admin")


class SettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = AgencySettingsSerializer
    permission_classes = [AdminWriteOnly]

    def get_object(self):
        return AgencySettings.get()


# ---------- Davomat ----------

def can_mark_attendance(user):
    s = AgencySettings.get()
    return has_role(user, "admin", "hr") or (s.attendance_manager_id is not None and s.attendance_manager_id == user.pk)


def tracked_users():
    return User.objects.filter(is_active=True, track_attendance=True).order_by("first_name", "last_name")


@api_view(["GET", "POST"])
def attendance_day(request):
    s = AgencySettings.get()
    day = _parse_date(request.query_params.get("date") or request.data.get("date"), timezone.localdate())
    editor = can_mark_attendance(request.user)

    if request.method == "POST":
        if not editor:
            raise PermissionDenied("Davomatni faqat rahbar yoki tayinlangan xodim belgilaydi.")
        rows = AttendanceRowSerializer(data=request.data.get("rows", []), many=True)
        rows.is_valid(raise_exception=True)
        valid_ids = set(tracked_users().values_list("pk", flat=True))
        with transaction.atomic():
            for row in rows.validated_data:
                if row["user"] not in valid_ids:
                    continue
                st = row.get("status") or ("present" if row.get("check_in") else "")
                if not st:
                    Attendance.objects.filter(user_id=row["user"], date=day).delete()
                    continue
                rec, _ = Attendance.objects.get_or_create(
                    user_id=row["user"], date=day, defaults={"status": st}
                )
                rec.status = st
                rec.check_in = row.get("check_in") if st == "present" else None
                rec.check_out = row.get("check_out") if st == "present" else None
                rec.left_with_permission = row.get("left_with_permission", False)
                rec.note = row.get("note", "")
                rec.marked_by = request.user
                rec.save()

    records = {a.user_id: a for a in Attendance.objects.filter(date=day)}
    users = tracked_users() if editor else tracked_users().filter(pk=request.user.pk)
    out, stats = [], defaultdict(int)
    for u in users:
        a = records.get(u.pk)
        late = bool(a and a.status == "present" and a.check_in and a.check_in > s.work_start)
        early = bool(a and a.status == "present" and a.check_out and a.check_out < s.work_end
                     and not a.left_with_permission)
        if not a:
            stats["unmarked"] += 1
        elif a.status == "present":
            stats["late" if late else "on_time"] += 1
        else:
            stats[a.status] += 1
        if early:
            stats["early"] += 1
        out.append({
            "user": u.pk, "name": str(u), "position": u.position,
            "status": a.status if a else "", "check_in": a.check_in if a else None,
            "check_out": a.check_out if a else None,
            "left_with_permission": a.left_with_permission if a else False,
            "note": a.note if a else "", "fine": a.fine if a else Decimal("0"),
            "late": late, "early": early,
        })
    return Response({
        "date": day, "is_workday": s.is_workday(day), "can_edit": editor,
        "work_start": s.work_start, "work_end": s.work_end, "late_limit": s.late_limit,
        "fines": {"late": s.late_fine, "late_hard": s.late_fine_hard, "absent": s.absent_fine, "early": s.early_fine},
        "stats": stats, "rows": out,
    })


@api_view(["GET"])
def attendance_month(request):
    """Oylik hisobot: har bir xodim bo'yicha kunlar matritsasi va jami jarimalar."""
    s = AgencySettings.get()
    today = timezone.localdate()
    try:
        y, m = map(int, request.query_params.get("month", "").split("-"))
        first = date(y, m, 1)
    except ValueError:
        first = today.replace(day=1)
    nxt = (first + timedelta(days=32)).replace(day=1)
    days = [first + timedelta(days=i) for i in range((nxt - first).days)]

    users = tracked_users()
    if not (can_mark_attendance(request.user) or has_role(request.user, "accountant", "manager", "hr")):
        users = users.filter(pk=request.user.pk)
    recs = defaultdict(dict)
    for a in Attendance.objects.filter(date__gte=first, date__lt=nxt, user__in=users):
        recs[a.user_id][a.date] = a

    rows = []
    for u in users:
        cells, t = [], defaultdict(int)
        fines = Decimal("0")
        for d in days:
            a = recs[u.pk].get(d)
            if a is None:
                code = "" if (d > today or not s.is_workday(d)) else "none"
            elif a.status == "present":
                code = "late" if a.check_in and a.check_in > s.work_start else "present"
            else:
                code = a.status
            if a and a.status == "present" and a.check_out and a.check_out < s.work_end and not a.left_with_permission:
                t["early"] += 1
            if code:
                t[code] += 1
            if a:
                fines += a.fine
            cells.append(code)
        rows.append({"user": u.pk, "name": str(u), "position": u.position, "cells": cells,
                     "totals": t, "fines": fines})
    return Response({
        "month": first.strftime("%Y-%m"),
        "days": [{"date": d, "weekday": d.weekday(), "workday": s.is_workday(d)} for d in days],
        "rows": rows,
    })


# ---------- Oylik vedomost ----------

def _payroll_period(request):
    """(oylik sanasi, davr boshi, davr oxiri). pay_date berilmasa — eng so'nggi oylik kuni."""
    from .models import _shift_month

    pay = _parse_date(request.query_params.get("pay_date") or request.data.get("pay_date"))
    if not pay:
        return AgencySettings.get().pay_period(timezone.localdate())
    return pay, _shift_month(pay, -1), pay - timedelta(days=1)


def generate_payroll(pay_date, start, end):
    """Davr uchun vedomost qatorlarini yaratadi/yangilaydi (fiks oylik va davomat jarimalari)."""
    fines = {
        r["user"]: r["s"]
        for r in Attendance.objects.filter(date__range=(start, end)).values("user").annotate(s=Sum("fine"))
    }
    existing = {e.user_id: e for e in PayrollEntry.objects.filter(pay_date=pay_date)}
    for u in User.objects.filter(Q(is_active=True, salary__gt=0) | Q(pk__in=existing.keys())):
        e = existing.get(u.pk) or PayrollEntry(user=u, pay_date=pay_date, period_start=start, period_end=end)
        if e.paid_amount <= 0:
            e.base_salary = u.salary
        e.fines = fines.get(u.pk, Decimal("0"))
        e.period_start, e.period_end = start, end
        e.save()


class PayrollViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollEntrySerializer
    permission_classes = [PayrollPermission]
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        qs = PayrollEntry.objects.select_related("user")
        if self.action == "list":
            pay_date, _, _ = _payroll_period(self.request)
            qs = qs.filter(pay_date=pay_date)
        return qs

    def list(self, request, *args, **kwargs):
        pay_date, start, end = _payroll_period(request)
        generate_payroll(pay_date, start, end)
        entries = self.get_queryset()
        data = self.get_serializer(entries, many=True).data
        total = sum((e.net for e in entries), Decimal("0"))
        paid = sum((e.paid_amount for e in entries), Decimal("0"))
        return Response({
            "pay_date": pay_date, "period_start": start, "period_end": end,
            "total": total, "paid": paid, "balance": total - paid, "results": data,
        })

    def create(self, request, *args, **kwargs):
        raise ValidationError("Vedomost qatorlari avtomatik yaratiladi.")

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """Maosh to'lash: to'lovni qayd qiladi va xarajatlarga 'Maosh' sifatida yozadi."""
        if not has_role(request.user, "admin", "accountant"):
            raise PermissionDenied()
        entry = self.get_object()
        try:
            amount = Decimal(str(request.data.get("amount") or entry.balance))
        except Exception:
            raise ValidationError({"amount": "Noto'g'ri summa"})
        if amount <= 0 or amount > entry.balance:
            raise ValidationError({"amount": f"Summa 0 dan katta va qoldiqdan ({entry.balance}) oshmasligi kerak."})
        with transaction.atomic():
            Expense.objects.create(
                category=Expense.Category.SALARY, amount=amount, employee=entry.user,
                date=_parse_date(request.data.get("date"), timezone.localdate()),
                description=f"Oylik: {entry.period_start:%d.%m.%Y}–{entry.period_end:%d.%m.%Y}",
            )
            entry.paid_amount += amount
            entry.save(update_fields=["paid_amount"])
        return Response(self.get_serializer(entry).data)


@api_view(["GET"])
def my_payroll(request):
    s = AgencySettings.get()
    pay_date, start, end = s.pay_period(timezone.localdate())
    # Joriy (hali berilmagan) davr: oxirgi oylik sanasidan keyingi oylik sanasigacha.
    next_pay = (pay_date + timedelta(days=32)).replace(day=pay_date.day)
    fines = Attendance.objects.filter(user=request.user, date__gte=pay_date, date__lt=next_pay).aggregate(
        s=Sum("fine"))["s"] or Decimal("0")
    history = PayrollEntrySerializer(
        PayrollEntry.objects.filter(user=request.user).order_by("-pay_date")[:6], many=True
    ).data
    return Response({
        "current": {"period_start": pay_date, "period_end": next_pay - timedelta(days=1), "pay_date": next_pay,
                    "base_salary": request.user.salary, "fines": fines,
                    "expected": request.user.salary - fines},
        "history": history,
    })


# ---------- Yozuvlar ----------

class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    filterset_fields = ["kind", "project", "shared", "author"]
    search_fields = ["title", "body"]

    def get_queryset(self):
        u = self.request.user
        return Note.objects.select_related("author", "project").filter(Q(author=u) | Q(shared=True))

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def _check(self, note):
        if note.author_id != self.request.user.pk and not self.request.user.is_admin:
            raise PermissionDenied("Faqat o'z yozuvingizni o'zgartira olasiz.")

    def perform_update(self, serializer):
        self._check(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._check(instance)
        instance.delete()

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        note = self.get_object()
        if request.method == "POST":
            if not note.shared and note.author_id != request.user.pk:
                raise PermissionDenied()
            ser = NoteMessageSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            ser.save(note=note, author=request.user)
            return Response(ser.data, status=status.HTTP_201_CREATED)
        return Response(NoteMessageSerializer(note.messages.select_related("author"), many=True).data)


# ---------- Telegram ----------

class AdminOnly(BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, "admin")


@api_view(["POST"])
@permission_classes([AdminOnly])
def telegram_test(request):
    from . import telegram

    ok, res = telegram.send_message(
        "✅ <b>Agentlik ERP</b> ulandi. Vazifalar bo'yicha bildirishnomalar shu yerga keladi.", sync=True)
    if not ok:
        raise ValidationError({"detail": f"Yuborilmadi: {res}"})
    return Response({"detail": "Sinov xabari yuborildi"})


@api_view(["GET"])
@permission_classes([AdminOnly])
def telegram_discover(request):
    """Bot ko'rgan so'nggi xabarlardan guruh va topic'larni topadi (ID'larni qo'lda qidirmaslik uchun)."""
    from . import telegram

    ok, res = telegram.call("getUpdates", {"limit": 100, "allowed_updates": ["message"]})
    if not ok:
        raise ValidationError({"detail": f"Telegram javob bermadi: {res}"})
    found = {}
    for upd in res:
        msg = upd.get("message") or upd.get("channel_post") or {}
        chat = msg.get("chat") or {}
        if chat.get("type") not in ("group", "supergroup"):
            continue
        thread = msg.get("message_thread_id") if msg.get("is_topic_message") else None
        topic = (msg.get("reply_to_message") or {}).get("forum_topic_created", {}).get("name") \
            or (msg.get("forum_topic_created") or {}).get("name")
        key = (chat["id"], thread)
        item = found.setdefault(key, {"chat_id": str(chat["id"]), "chat_title": chat.get("title", ""),
                                      "thread_id": thread, "topic_name": topic or "", "last_text": ""})
        if topic and not item["topic_name"]:
            item["topic_name"] = topic
        item["last_text"] = (msg.get("text") or "")[:60]
    return Response(list(found.values()))


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def cron_tick(request):
    """Tashqi cron (cron-job.org) har 10 daqiqada chaqiradi: ?key=CRON_SECRET.

    - muddatga oz qolgan vazifalar uchun eslatma;
    - yoqilgan bo'lsa — ish kuni boshida bir marta kunlik xulosa.
    Qo'shimcha foyda: bepul serverni "uyg'oq" tutadi.
    """
    import os

    from . import telegram

    secret = os.getenv("CRON_SECRET", "")
    if not secret or request.query_params.get("key") != secret:
        raise PermissionDenied("Kalit noto'g'ri")
    s = AgencySettings.get()
    reminders = telegram.deadline_reminders()
    digest = "o'chirilgan"
    now = timezone.localtime()
    if s.tg_daily_digest:
        due = now.time() >= s.work_start and s.is_workday(now.date())
        if request.query_params.get("force") == "1" or (due and s.last_digest_date != now.date()):
            text = telegram.daily_digest(now.date())
            if text:
                telegram.send_message(text, sync=True)
            s.last_digest_date = now.date()
            s.save(update_fields=["last_digest_date"])
            digest = "yuborildi" if text else "vazifa yo'q"
        else:
            digest = "hali vaqti emas yoki bugun yuborilgan"
    return Response({"reminders": reminders, "digest": digest})


# Eski manzil bilan moslik
cron_daily = cron_tick
