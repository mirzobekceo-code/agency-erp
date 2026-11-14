"""Telegram bot: webhook orqali kelgan xabarlar va tugma bosishlar.

Qoidalar:
- Jamoa guruhida (Sozlamalar'dagi guruh) va shaxsiy chatda buyruqlar ishlaydi.
- Boshqa guruhlarda (mijoz guruhlari) bot hech narsaga javob bermaydi — faqat guruhni eslab qoladi,
  keyin u yerga faqat syomka eslatmasi yuboriladi.
"""

import hashlib
import re
from datetime import datetime, time, timedelta
from html import escape

from django.conf import settings as dj_settings
from django.db import IntegrityError
from django.utils import timezone

from . import telegram
from .models import AgencySettings, TelegramChat

HELP = (
    "🤖 <b>Agentlik ERP boti</b>\n\n"
    "<b>Vazifa berish</b> (jamoa guruhida yoki shu yerda):\n"
    "<code>/vazifa @username Vazifa matni ertaga 15:00</code>\n"
    "Muddat: <i>bugun, ertaga, indinga, 25.11, 25.11.2026</i> va vaqt <i>15:00</i> (ixtiyoriy).\n"
    "Oxiriga <b>!</b> qo'ysangiz — muhim, <b>!!</b> — shoshilinch.\n\n"
    "/vazifalarim — mening ochiq vazifalarim\n"
    "/yordam — shu yordam"
)


def webhook_secret():
    return hashlib.sha256(f"{dj_settings.SECRET_KEY}:telegram".encode()).hexdigest()[:40]


def webhook_url():
    base = telegram.site_url()
    return f"{base}/api/telegram/webhook/" if base else None


def set_webhook(url=None):
    url = url or webhook_url()
    if not url:
        return False, "Sayt manzili aniqlanmadi (SITE_URL)"
    return telegram.call("setWebhook", {
        "url": url, "secret_token": webhook_secret(), "drop_pending_updates": True,
        "allowed_updates": ["message", "callback_query", "my_chat_member"],
    })


# ---------- Yordamchi ----------

def _remember_chat(chat, msg=None, active=True):
    if chat.get("type") not in ("group", "supergroup"):
        return
    obj, _ = TelegramChat.objects.get_or_create(chat_id=str(chat["id"]))
    obj.title = chat.get("title", obj.title)
    obj.type = chat.get("type", "")
    obj.active = active
    if msg and msg.get("is_topic_message") and msg.get("message_thread_id"):
        name = ((msg.get("reply_to_message") or {}).get("forum_topic_created") or {}).get("name") \
            or (msg.get("forum_topic_created") or {}).get("name")
        key = str(msg["message_thread_id"])
        if name or key not in obj.topics:
            obj.topics[key] = name or obj.topics.get(key, "")
    obj.save()


def find_user(tg_user):
    """Telegram foydalanuvchisini ERP xodimiga bog'laydi: avval ID, keyin @username bo'yicha."""
    from apps.accounts.models import User

    if not tg_user:
        return None
    u = User.objects.filter(telegram_user_id=tg_user["id"], is_active=True).first()
    if u:
        return u
    username = (tg_user.get("username") or "").lower()
    if not username:
        return None
    for cand in User.objects.filter(is_active=True, telegram_user_id__isnull=True).exclude(telegram=""):
        if cand.telegram.strip().lstrip("@").lower() == username:
            cand.telegram_user_id = tg_user["id"]
            try:
                cand.save(update_fields=["telegram_user_id"])
            except IntegrityError:
                return None
            return cand
    return None


def user_by_username(username):
    from apps.accounts.models import User

    username = username.lstrip("@").lower()
    for u in User.objects.filter(is_active=True).exclude(telegram=""):
        if u.telegram.strip().lstrip("@").lower() == username:
            return u
    return None


def _reply(msg, text):
    telegram.send_to(msg["chat"]["id"], text, thread_id=msg.get("message_thread_id")
                     if msg.get("is_topic_message") else None, sync=True)


# ---------- /vazifa matnini tahlil qilish ----------

DATE_WORDS = {"bugun": 0, "ertaga": 1, "indinga": 2}
TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
DATE_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$")


def parse_task_text(text, today=None):
    """"@sardor Kolleksiya syomkasi ertaga 15:00 !" -> dict(username, title, due_date, due_time, priority)."""
    today = today or timezone.localdate()
    words = text.split()
    username = None
    if words and words[0].startswith("@"):
        username = words.pop(0)
    priority = "medium"
    due_date = due_time = None
    while words:
        w = words[-1].lower()
        if w in ("!", "!!"):
            priority = "urgent" if w == "!!" else "high"
        elif TIME_RE.match(w) and due_time is None:
            h, m = TIME_RE.match(w).groups()
            due_time = time(int(h), int(m))
        elif w in DATE_WORDS and due_date is None:
            due_date = today + timedelta(days=DATE_WORDS[w])
        elif DATE_RE.match(w) and due_date is None:
            d, mth, y = DATE_RE.match(w).groups()
            year = int(y) + (2000 if y and len(y) == 2 else 0) if y else today.year
            try:
                due_date = datetime(year, int(mth), int(d)).date()
            except ValueError:
                break
            if not y and due_date < today:
                due_date = due_date.replace(year=today.year + 1)
        else:
            break
        words.pop()
    if due_time and not due_date:
        due_date = today
    return {"username": username, "title": " ".join(words).strip(), "due_date": due_date,
            "due_time": due_time, "priority": priority}


def cmd_task(msg, author, args):
    from apps.projects.models import Task

    if not author:
        return _reply(msg, "Sizni tizimdan topa olmadim. Jamoa bo'limida Telegram username'ingiz yozilganini "
                           "tekshiring va botga shaxsiy chatda /start yozing.")
    p = parse_task_text(args)
    if not p["username"] or not p["title"]:
        return _reply(msg, "Namuna: <code>/vazifa @username Vazifa matni ertaga 15:00</code>")
    assignee = user_by_username(p["username"])
    if not assignee:
        return _reply(msg, f"{escape(p['username'])} tizimda topilmadi — Jamoa bo'limida xodimning "
                           f"Telegram username'i yozilmagan.")
    task = Task.objects.create(title=p["title"][:255], assignee=assignee, created_by=author,
                               due_date=p["due_date"], due_time=p["due_time"], priority=p["priority"])
    telegram.task_created(task, author)
    s = AgencySettings.get()
    if str(msg["chat"]["id"]) != str(s.telegram_chat_id):
        _reply(msg, f"✅ Vazifa yaratildi va jamoa guruhiga e'lon qilindi: <b>{escape(task.title)}</b>")


def cmd_my_tasks(msg, author):
    from apps.projects.models import Task

    if not author:
        return _reply(msg, "Sizni tizimdan topa olmadim. Botga shaxsiy chatda /start yozing.")
    tasks = (Task.objects.filter(assignee=author).exclude(status=Task.Status.DONE)
             .select_related("project").order_by("due_date")[:15])
    if not tasks:
        return _reply(msg, "🎉 Ochiq vazifalaringiz yo'q.")
    lines = [f"📋 <b>{escape(str(author))} — ochiq vazifalar</b>"]
    for t in tasks:
        dl = telegram._deadline_text(t)
        mark = "👀 " if t.status == Task.Status.REVIEW else ""
        lines.append(f"• {mark}{telegram._task_link(t)}" + (f" — {dl}" if dl else ""))
    _reply(msg, "\n".join(lines))


def cmd_start(msg):
    tg_user = msg.get("from") or {}
    user = find_user(tg_user)
    if user:
        _reply(msg, f"Salom, {escape(user.first_name or str(user))}! 👋\n"
                    "Endi sizga tegishli shaxsiy xabarlar shu yerga keladi.\n\n" + HELP)
    else:
        name = f"@{tg_user['username']}" if tg_user.get("username") else "Telegram username'ingiz"
        _reply(msg, f"Salom! {escape(name)} tizimda topilmadi.\n"
                    "Rahbardan Jamoa bo'limida kartochkangizga Telegram username'ingizni yozishini so'rang, "
                    "keyin shu yerga yana /start yozing.")


# ---------- Holat tugmalari ----------

def handle_callback(cq):
    from apps.projects.models import Task, TaskComment

    from . import freelance

    def answer(text, alert=False):
        telegram.call("answerCallbackQuery", {"callback_query_id": cq["id"], "text": text, "show_alert": alert})

    m = re.match(r"^st:(\d+):(done|going|late)$", cq.get("data") or "")
    if not m:
        return answer("Noma'lum tugma")
    task = Task.objects.filter(pk=m.group(1)).select_related("assignee", "created_by", "project").first()
    if not task:
        return answer("Vazifa topilmadi", True)
    user = find_user(cq.get("from"))
    if not user or user.pk != task.assignee_id:
        return answer("Bu tugma faqat vazifa ijrochisi uchun", True)
    ans = m.group(2)
    if task.status == Task.Status.DONE or (ans == "done" and task.status == Task.Status.REVIEW):
        return answer("Vazifa allaqachon topshirilgan")
    now = timezone.now()
    if ans == "done":
        task.status = Task.Status.DONE if task.can_supervise(user) else Task.Status.REVIEW
        task.submitted_at = now
        if task.status == Task.Status.DONE:
            task.done_at = now
    elif ans == "going" and task.status == Task.Status.TODO:
        task.status = Task.Status.IN_PROGRESS
    task.last_status_ask = ans
    task.save()
    TaskComment.objects.create(task=task, author=user, text=f"Telegram: {telegram.STATUS_ANSWERS[ans]}")
    if task.status == Task.Status.DONE:
        freelance.accrue_for_task(task, user)
    if ans == "late" and task.created_by_id and task.created_by_id != user.pk:
        telegram.send_private(task.created_by, f"⚠️ <b>Kechikadi</b>: {telegram._task_link(task)}\n"
                                               f"👤 {escape(str(user))}", sync=True)
    msg = cq.get("message") or {}
    if msg:
        chat_id = msg["chat"]["id"]
        telegram.call("editMessageReplyMarkup", {"chat_id": chat_id, "message_id": msg["message_id"],
                                                 "reply_markup": {"inline_keyboard": []}})
        payload = {"chat_id": chat_id, "parse_mode": "HTML", "reply_to_message_id": msg["message_id"],
                   "text": f"{escape(str(user))}: {telegram.STATUS_ANSWERS[ans]}"}
        if msg.get("is_topic_message"):
            payload["message_thread_id"] = msg.get("message_thread_id")
        telegram.call("sendMessage", payload)
    answer("Qabul qilindi ✅")


def describe_update(update):
    """Diagnostika uchun qisqa tavsif: qaysi chatdan, qanday turdagi xabar."""
    for key in ("message", "edited_message", "my_chat_member", "callback_query"):
        if key in update:
            obj = update[key]
            chat = obj.get("chat") or (obj.get("message") or {}).get("chat") or {}
            return {"kind": key, "chat_id": str(chat.get("id", "")), "chat_title": chat.get("title", ""),
                    "chat_type": chat.get("type", ""), "text": (obj.get("text") or obj.get("data") or "")[:60]}
    return {"kind": ",".join(k for k in update if k != "update_id")}


# ---------- Kirish nuqtasi ----------

def handle_update(update):
    if "my_chat_member" in update:
        mcm = update["my_chat_member"]
        status = (mcm.get("new_chat_member") or {}).get("status")
        _remember_chat(mcm.get("chat") or {}, active=status not in ("left", "kicked"))
        return
    if "callback_query" in update:
        return handle_callback(update["callback_query"])
    msg = update.get("message")
    if not msg:
        return
    chat = msg.get("chat") or {}
    _remember_chat(chat, msg)
    text = (msg.get("text") or "").strip()
    if not text.startswith("/"):
        return
    cmd, _, args = text.partition(" ")
    cmd = cmd.split("@")[0].lower()
    s = AgencySettings.get()
    private = chat.get("type") == "private"
    if not private and str(chat.get("id")) != str(s.telegram_chat_id):
        return  # mijoz guruhlari va boshqa guruhlarda jim turadi
    if cmd == "/start" and private:
        return cmd_start(msg)
    author = find_user(msg.get("from"))
    if cmd in ("/vazifa", "/task"):
        return cmd_task(msg, author, args)
    if cmd in ("/vazifalarim", "/my"):
        return cmd_my_tasks(msg, author)
    if cmd in ("/yordam", "/help") or (cmd == "/start" and not private):
        return _reply(msg, HELP)
