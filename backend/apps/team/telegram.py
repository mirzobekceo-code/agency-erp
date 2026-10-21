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


def task_created(task, actor):
    from .models import AgencySettings

    if not AgencySettings.get().tg_task_created:
        return
    text = "\n".join([f"🆕 <b>Yangi vazifa</b>: {_task_link(task)}", *_task_lines(task),
                      f"✍️ Qo'ydi: {escape(str(actor))}"])
    send_message(text)


def task_updated(task, actor, old_status, old_assignee_id, returned=False, reason=""):
    from apps.projects.models import Task

    from .models import AgencySettings

    s = AgencySettings.get()
    if s.tg_task_assigned and old_assignee_id != task.assignee_id and task.assignee_id:
        send_message("\n".join([f"👉 <b>Vazifa biriktirildi</b>: {_task_link(task)}", *_task_lines(task),
                                f"✍️ {escape(str(actor))}"]))
    if s.tg_task_status and old_status != task.status:
        if returned:
            why = f"\n📝 {escape(reason)}" if reason else ""
            send_message(f"↩️ <b>Qaytarildi</b>: {_task_link(task)}\n📁 {_proj(task)}"
                         f"\n👤 {_who(task.assignee)}{why}\n✍️ {escape(str(actor))}")
            return
        icon = {"done": "✅", "review": "👀", "in_progress": "▶️", "todo": "↩️"}.get(task.status, "🔄")
        label = {"review": "Tasdiqqa yuborildi",
                 "done": "Tasdiqlandi" if old_status == "review" else "Tayyor"}.get(task.status,
                                                                                  Task.Status(task.status).label)
        extra = ""
        if task.status == "review" and task.created_by and task.created_by_id != actor.pk:
            extra = f"\n🔎 Tasdiqlaydi: {_who(task.created_by)}"
        elif task.status == "done" and task.assignee_id and task.assignee_id != actor.pk:
            extra = f"\n👤 {_who(task.assignee)}"
        send_message(f"{icon} <b>{escape(label)}</b>: {_task_link(task)}\n📁 {_proj(task)}"
                     f"\n✍️ {escape(str(actor))}{extra}")


def task_commented(comment):
    from .models import AgencySettings

    if not AgencySettings.get().tg_task_comment:
        return
    task = comment.task
    body = escape(comment.text[:500])
    mention = ""
    if task.assignee_id and task.assignee_id != comment.author_id:
        mention = f"\n👤 {_who(task.assignee)}"
    send_message(f"💬 <b>Izoh</b>: {_task_link(task)}\n<b>{escape(str(comment.author))}:</b> {body}{mention}")


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
