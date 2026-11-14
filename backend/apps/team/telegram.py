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


def send_to(chat_id, text, thread_id=None, reply_markup=None, sync=False, token=None):
    """Istalgan chatga HTML xabar. sync=False bo'lsa fon oqimida, tranzaksiyadan keyin."""
    token = token or bot_token()
    if not token or not chat_id:
        return False, "Telegram sozlanmagan"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if thread_id:
        payload["message_thread_id"] = thread_id
    if reply_markup:
        payload["reply_markup"] = reply_markup
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


def send_message(text, sync=False, reply_markup=None):
    """Jamoa guruhining "Vazifalar" topic'iga."""
    from .models import AgencySettings

    s = AgencySettings.get()
    return send_to(s.telegram_chat_id, text, s.telegram_tasks_thread_id, reply_markup, sync, bot_token(s))


def send_private(user, text, sync=False, reply_markup=None):
    """Xodimning shaxsiy chatiga (u botga /start yozgan bo'lsa). Guruhga hech qachon tushmaydi."""
    if not user or not user.telegram_user_id:
        return False, "Xodim botga /start yozmagan"
    return send_to(user.telegram_user_id, text, reply_markup=reply_markup, sync=sync)


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
        text = (f"⏰ <b>Muddatga {left_txt} qoldi</b>: {_task_link(task)}\n👤 {_who(task.assignee)}"
                f"\n📁 {_proj(task)}\n📅 Muddat: {timezone.localtime(dl):%d.%m.%Y %H:%M}")
        markup = None
        if s.tg_deadline_buttons:
            text += "\n\nIsh qanday ketyapti?"
            markup = status_keyboard(task)
        ok, _ = send_message(text, sync=True, reply_markup=markup)
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


# ---------- Holatni so'rash tugmalari ----------

STATUS_ANSWERS = {
    "done": "✅ Tayyor, tasdiqqa yubordim",
    "going": "⏳ Jarayonda, vaqtida ulguraman",
    "late": "⚠️ Kechikadi",
}


def status_keyboard(task):
    return {"inline_keyboard": [[
        {"text": "✅ Tayyor", "callback_data": f"st:{task.pk}:done"},
        {"text": "⏳ Jarayonda", "callback_data": f"st:{task.pk}:going"},
        {"text": "⚠️ Kechikadi", "callback_data": f"st:{task.pk}:late"},
    ]]}


# ---------- Mijoz guruhiga syomka eslatmasi ----------

def _uz_date(d):
    from apps.reports.views import MONTHS_UZ

    return f"{d.day}-{MONTHS_UZ[d.month - 1]}"


def shoot_reminder_text(client, shoots, s=None):
    """Bir mijozning ertangi syomkalari uchun bitta xabar (matn shabloni Sozlamalar'da)."""
    from django.utils import timezone

    from .models import AgencySettings

    s = s or AgencySettings.get()
    first = timezone.localtime(min(p.shoot_at for p in shoots))
    places = sorted({p.shoot_location for p in shoots if p.shoot_location})
    data = {
        "sana": _uz_date(first.date()), "vaqt": first.strftime("%H:%M"), "mijoz": client.name,
        "agentlik": s.name, "joy": f"\n📍 Joy: {', '.join(places)}" if places else "",
    }
    text = s.shoot_reminder_text or AgencySettings._meta.get_field("shoot_reminder_text").default
    for k, v in data.items():
        text = text.replace("{" + k + "}", v)
    return escape(text)


def shoot_reminders(now=None):
    """Kelishilgan syomkadan bir kun oldin (belgilangan soatdan keyin) mijoz guruhiga eslatma.

    Mijoz guruhiga faqat shu xabar boradi. Bir mijozning bir kundagi syomkalari bitta xabarga jamlanadi.
    """
    from collections import defaultdict
    from datetime import timedelta

    from django.utils import timezone

    from apps.content.models import ContentPost

    from .models import AgencySettings

    s = AgencySettings.get()
    if not s.tg_shoot_reminder:
        return 0
    now = timezone.localtime(now or timezone.now())
    if now.time() < s.shoot_reminder_time:
        return 0
    tomorrow = now.date() + timedelta(days=1)
    posts = (ContentPost.objects.filter(shoot_confirmed=True, shoot_reminder_sent_at__isnull=True,
                                        shoot_at__date=tomorrow)
             .exclude(project__client__telegram_group_id="").select_related("project__client"))
    by_client = defaultdict(list)
    for p in posts:
        by_client[p.project.client].append(p)
    sent = 0
    for client, shoots in by_client.items():
        ok, res = send_to(client.telegram_group_id, shoot_reminder_text(client, shoots, s), sync=True)
        if ok:
            ContentPost.objects.filter(pk__in=[p.pk for p in shoots]).update(shoot_reminder_sent_at=now)
            sent += 1
        else:
            log.warning("Syomka eslatmasi yuborilmadi (%s): %s", client, res)
    return sent


# ---------- Frilanser: ish va to'lov (faqat shaxsiy chat) ----------

def _money(v):
    return f"{v:,.0f}".replace(",", " ") + " so'm"


def _unpaid_total(user):
    from django.db.models import Sum

    return user.piece_works.filter(paid_at__isnull=True).aggregate(s=Sum("amount"))["s"] or 0


def piece_added(pw):
    from .models import AgencySettings

    if not AgencySettings.get().tg_freelance_dm:
        return
    qty = f" × {pw.quantity:g}" if pw.quantity != 1 else ""
    lines = [f"✅ <b>Ish qabul qilindi</b>: {escape(pw.title)}{qty}"]
    if pw.project_id:
        lines.append(f"📁 {escape(pw.project.name)}")
    lines += [f"💰 Hisobingizga qo'shildi: <b>+{_money(pw.amount)}</b>",
              f"🗓 To'lov: {pw.get_pay_mode_display().lower()}",
              f"📒 Jami to'lanmagan: {_money(_unpaid_total(pw.user))}"]
    send_private(pw.user, "\n".join(lines))


def piece_paid(user, works):
    from .models import AgencySettings

    if not works or not AgencySettings.get().tg_freelance_dm:
        return
    total = sum(w.amount for w in works)
    lines = [f"💸 <b>To'landi: {_money(total)}</b>"]
    for w in works[:10]:
        lines.append(f"   • {escape(w.title)} — {_money(w.amount)}")
    if len(works) > 10:
        lines.append(f"   … yana {len(works) - 10} ta")
    left = _unpaid_total(user)
    if left:
        lines.append(f"📒 Qolgan qarzimiz: {_money(left)}")
    send_private(user, "\n".join(lines))


# ---------- Oy oxiri: samaradorlik hisoboti (faqat rahbarga) ----------

def monthly_kpi_text(first):
    from apps.reports.views import MONTHS_UZ, team_kpi

    data = team_kpi(first)
    rows = data["rows"]
    lines = [f"📊 <b>{MONTHS_UZ[first.month - 1].capitalize()} {first.year} — jamoa samaradorligi</b>"]
    if not rows:
        return "\n".join(lines + ["Bu oyda yopilgan vazifa yo'q."])
    best = [r for r in rows if r["done"]][:3]
    if best:
        lines += ["", "🏆 <b>Eng yaxshilar</b>"]
        for i, r in enumerate(best, 1):
            lines.append(f"{i}. {escape(r['name'])} — {r['done']} ta, {r['on_time_pct']}% o'z vaqtida")
    late = sorted([r for r in rows if r["late"]], key=lambda r: -r["late"])
    if late:
        lines += ["", "⚠️ <b>Dedlayn o'tkazganlar</b>"]
        for r in late[:8]:
            extra = f" (hali ochiq: {r['overdue_open']})" if r["overdue_open"] else ""
            lines.append(f"• {escape(r['name'])} — {r['late']} ta kechikkan{extra}")
    returned = sorted([r for r in rows if r["returned"]], key=lambda r: -r["returned"])
    if returned:
        lines += ["", "↩️ <b>Ko'p qaytarilgan</b>"]
        for r in returned[:5]:
            lines.append(f"• {escape(r['name'])} — {r['returned']} marta")
    t = data["totals"]
    lines += ["", f"Jami: {t['done']} ta vazifa yopildi, {t['on_time_pct']}% o'z vaqtida, "
                  f"{t['late']} ta kechikkan."]
    f = data["freelance"]
    if f["accrued"]:
        lines.append(f"🎬 Frilanserlarga hisoblandi: {_money(f['accrued'])} · qarzimiz: {_money(f['unpaid'])}")
    base = site_url()
    if base:
        lines.append(f'\n<a href="{base}/kpi?month={first:%Y-%m}">Batafsil</a>')
    return "\n".join(lines)[:4000]


def kpi_recipient():
    from apps.accounts.models import User

    from .models import AgencySettings

    s = AgencySettings.get()
    if s.kpi_recipient_id:
        return s.kpi_recipient
    return User.objects.filter(is_active=True, role="admin", telegram_user_id__isnull=False).first()


def monthly_kpi(now=None):
    """Oyning oxirgi kuni ish tugaganda (o'tkazib yuborilsa — keyingi oyning 1–3-kunlari) bir marta yuboradi."""
    import calendar
    from datetime import timedelta

    from django.utils import timezone

    from .models import AgencySettings

    s = AgencySettings.get()
    if not s.tg_monthly_kpi:
        return None
    now = timezone.localtime(now or timezone.now())
    today = now.date()
    last_day = calendar.monthrange(today.year, today.month)[1]
    if today.day == last_day and now.time() >= s.work_end:
        month = today.replace(day=1)
    elif today.day <= 3:
        month = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    else:
        return None
    if s.last_kpi_month >= f"{month:%Y-%m}":
        return None
    user = kpi_recipient()
    if not user:
        return "oluvchi yo'q"
    ok, res = send_private(user, monthly_kpi_text(month), sync=True)
    if ok:
        s.last_kpi_month = f"{month:%Y-%m}"
        s.save(update_fields=["last_kpi_month"])
        return "yuborildi"
    return f"xato: {res}"
