"""Telegram guruhiga (forum topic'iga) bildirishnoma yuborish.

Token Sozlamalar'da saqlanadi (yoki TELEGRAM_BOT_TOKEN muhit o'zgaruvchisida). Xabarlar fon oqimida
yuboriladi — Telegram sekin yoki ishlamay qolsa ham tizimdagi amallar to'xtamaydi.
"""

import json
import logging
import os
import threading
import urllib.error
import urllib.request
from html import escape

from django.conf import settings as dj_settings
from django.db import transaction

log = logging.getLogger(__name__)
API = "https://api.telegram.org/bot{token}/{method}"

PRIORITY_ICON = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "⚪"}


def bot_token(s=None):
    from .models import AgencySettings

    s = s or AgencySettings.get()
    return s.telegram_bot_token or os.getenv("TELEGRAM_BOT_TOKEN", "")


def call(method, payload, token=None, timeout=10):
    """Bot API'ni sinxron chaqiradi. (ok, natija yoki xato matni) qaytaradi."""
    token = token or bot_token()
    if not token:
        return False, "Bot tokeni kiritilmagan"
    req = urllib.request.Request(
        API.format(token=token, method=method), data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            data = json.loads(e.read())
        except Exception:
            return False, f"HTTP {e.code}"
    except Exception as e:  # tarmoq xatosi
        return False, str(e)
    if not data.get("ok"):
        return False, data.get("description", "Noma'lum xato")
    return True, data.get("result")


def send_message(text, sync=False):
    """Vazifalar topic'iga HTML xabar yuboradi. sync=False bo'lsa fon oqimida, tranzaksiyadan keyin."""
    from .models import AgencySettings

    s = AgencySettings.get()
    token = bot_token(s)
    if not token or not s.telegram_chat_id:
        return False, "Telegram sozlanmagan"
    payload = {"chat_id": s.telegram_chat_id, "text": text, "parse_mode": "HTML",
               "disable_web_page_preview": True}
    if s.telegram_tasks_thread_id:
        payload["message_thread_id"] = s.telegram_tasks_thread_id
    if sync:
        return call("sendMessage", payload, token)

    def worker():
        ok, res = call("sendMessage", payload, token)
        if not ok:
            log.warning("Telegram xabari yuborilmadi: %s", res)

    if getattr(dj_settings, "TELEGRAM_SYNC", False):  # testlar uchun
        transaction.on_commit(worker)
    else:
        transaction.on_commit(lambda: threading.Thread(target=worker, daemon=True).start())
    return True, None


# ---------- Xabar matnlari ----------

def site_url():
    return (os.getenv("SITE_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")


def _who(user):
    """Ism + Telegram username bo'lsa @mention (telefoniga bildirishnoma boradi)."""
    if not user:
        return "<i>biriktirilmagan</i>"
    name = escape(str(user))
    tg = (user.telegram or "").strip().lstrip("@")
    if tg and " " not in tg and not tg.startswith("+") and not tg.isdigit():
        return f"{name} (@{escape(tg)})"
    return name


def _task_link(task):
    base = site_url()
    title = escape(task.title)
    return f'<a href="{base}/tasks?open={task.pk}">{title}</a>' if base else f"<b>{title}</b>"


def _proj(task):
    return escape(task.project.name) if task.project_id else "Umumiy"


def _task_lines(task):
    from apps.projects.models import Task

    lines = [f"📁 {_proj(task)}", f"👤 Ijrochi: {_who(task.assignee)}"]
    if task.due_date:
        lines.append(f"📅 Muddat: {task.due_date:%d.%m.%Y}")
    if task.priority in ("high", "urgent"):
        lines.append(f"{PRIORITY_ICON[task.priority]} {Task.Priority(task.priority).label}")
    return lines


def _deadline_text(task):
    if not task.due_date:
        return None
    t = task.due_time.strftime("%H:%M") if task.due_time else None
    return f"{task.due_date:%d.%m.%Y}" + (f" {t}" if t else "")


def task_created(task, actor, reassigned=False):
    """Xodimga yangi vazifa yozilganda (yoki vazifa unga o'tkazilganda) — @username bilan."""
    from .models import AgencySettings

    if not task.assignee_id or not AgencySettings.get().tg_task_created:
        return
    head = "👉 <b>Vazifa sizga o'tkazildi</b>" if reassigned else "🆕 <b>Yangi vazifa</b>"
    lines = [f"{head}: {_task_link(task)}", f"👤 {_who(task.assignee)}", f"📁 {_proj(task)}"]
    dl = _deadline_text(task)
    if dl:
        lines.append(f"📅 Muddat: {dl}")
    if task.priority in ("high", "urgent"):
        from apps.projects.models import Task

        lines.append(f"{PRIORITY_ICON[task.priority]} {Task.Priority(task.priority).label}")
    if actor and actor.pk != task.assignee_id:
        lines.append(f"✍️ Berdi: {escape(str(actor))}")
    send_message("\n".join(lines))


def task_updated(task, actor, old_assignee_id):
    """Faqat ijrochi o'zgarganda xabar beriladi (yangi ijrochi uchun bu — yangi vazifa)."""
    if task.assignee_id and task.assignee_id != old_assignee_id:
        task_created(task, actor, reassigned=True)


def deadline_reminders(now=None):
    """Muddatiga N soat (yoki kamroq) qolgan, hali bajarilmagan vazifalar uchun bir martalik eslatma."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.projects.models import Task

    from .models import AgencySettings

    s = AgencySettings.get()
    if not s.tg_deadline_reminder:
        return 0
    now = now or timezone.now()
    horizon = now + timedelta(hours=s.reminder_hours or 2)
    candidates = (
        Task.objects.filter(reminder_sent_at__isnull=True, due_date__isnull=False, assignee__isnull=False,
                            due_date__lte=timezone.localtime(horizon).date())
        .exclude(status=Task.Status.DONE).select_related("assignee", "project")
    )
    sent = 0
    for task in candidates:
        dl = task.deadline
        if not dl or not (now < dl <= horizon):
            continue
        left = dl - now
        hours, minutes = int(left.total_seconds() // 3600), int(left.total_seconds() % 3600 // 60)
        left_txt = f"{hours} soat {minutes} daqiqa" if hours else f"{minutes} daqiqa"
        ok, _ = send_message(
            f"⏰ <b>Muddatga {left_txt} qoldi</b>: {_task_link(task)}\n👤 {_who(task.assignee)}"
            f"\n📁 {_proj(task)}\n📅 Muddat: {timezone.localtime(dl):%d.%m.%Y %H:%M}", sync=True)
        if ok:
            task.reminder_sent_at = now
            task.save(update_fields=["reminder_sent_at"])
            sent += 1
    return sent


def daily_digest(today):
    """Ertalabki xulosa: bugungi, kechikkan va ertangi vazifalar ijrochilar bo'yicha."""
    from collections import defaultdict
    from datetime import timedelta

    from apps.projects.models import Task

    open_tasks = Task.objects.exclude(status=Task.Status.DONE).select_related("assignee", "project")
    overdue = list(open_tasks.filter(due_date__lt=today).order_by("due_date"))
    due_today = list(open_tasks.filter(due_date=today))
    tomorrow = open_tasks.filter(due_date=today + timedelta(days=1)).count()
    review = open_tasks.filter(status=Task.Status.REVIEW).count()
    if not (overdue or due_today or review):
        return None

    def block(title, tasks, show_days=False):
        by_user = defaultdict(list)
        for t in tasks:
            by_user[t.assignee].append(t)
        out = [title]
        for user, ts in by_user.items():
            out.append(f"👤 {_who(user)}")
            for t in ts[:8]:
                late = f" — <i>{(today - t.due_date).days} kun</i>" if show_days else ""
                out.append(f"   • {_task_link(t)} ({_proj(t)}){late}")
            if len(ts) > 8:
                out.append(f"   … yana {len(ts) - 8} ta")
        return out

    lines = [f"☀️ <b>Kunlik xulosa — {today:%d.%m.%Y}</b>"]
    if overdue:
        lines += [""] + block(f"⏰ <b>Muddati o'tgan: {len(overdue)}</b>", overdue, show_days=True)
    if due_today:
        lines += [""] + block(f"📌 <b>Bugun topshiriladi: {len(due_today)}</b>", due_today)
    lines += ["", f"👀 Tekshiruvda: {review} · 📅 Ertaga: {tomorrow}"]
    text = "\n".join(lines)
    return text[:4000]
