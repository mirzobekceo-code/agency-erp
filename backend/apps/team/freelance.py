"""Frilanserlarning donabay ishlari: hisoblash va to'lash."""

from django.db import transaction
from django.utils import timezone

from apps.finance.models import Expense

from . import telegram
from .models import PieceWork


def accrue_for_task(task, actor):
    """Donabay narxi belgilangan vazifa tasdiqlanganda ijrochiga pul yoziladi (bir marta)."""
    if not (task.piece_rate_id and task.assignee_id) or PieceWork.objects.filter(task=task).exists():
        return None
    rate = task.piece_rate
    pw = PieceWork.objects.create(
        user=task.assignee, rate=rate, title=task.title, quantity=task.piece_qty or 1, price=rate.price,
        date=timezone.localdate(), project=task.project, task=task, pay_mode=task.piece_pay_mode,
        created_by=actor,
    )
    telegram.piece_added(pw)
    return pw


def cancel_for_task(task):
    """Vazifa qayta ochilsa — hali to'lanmagan hisob bekor qilinadi."""
    PieceWork.objects.filter(task=task, paid_at__isnull=True).delete()


@transaction.atomic
def pay(works, actor=None, date=None):
    """To'lanmagan ishlarni to'langan qiladi: har bir xodim va loyiha uchun bitta "Frilanser" xarajati yoziladi."""
    from collections import defaultdict

    date = date or timezone.localdate()
    works = [w for w in works if not w.paid_at]
    groups = defaultdict(list)
    for w in works:
        groups[(w.user_id, w.project_id)].append(w)
    for (_, project_id), ws in groups.items():
        user = ws[0].user
        exp = Expense.objects.create(
            category=Expense.Category.FREELANCER, amount=sum(w.amount for w in ws), date=date,
            project_id=project_id, employee=user,
            description=f"{user}: " + ", ".join(w.title for w in ws)[:200],
        )
        for w in ws:
            w.paid_at, w.expense = date, exp
            w.save(update_fields=["paid_at", "expense"])
    by_user = defaultdict(list)
    for w in works:
        by_user[w.user].append(w)
    for user, ws in by_user.items():
        telegram.piece_paid(user, ws)
    return works
