from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import has_role
from apps.projects.models import Project

from .models import ClientReport, ContentPost
from .serializers import ClientReportSerializer, ContentPostSerializer

S = ContentPost.Status


def queue_q(user):
    """Navbati shu foydalanuvchida bo'lgan kontentlar (bosqichga qarab mas'ul)."""
    return (
        Q(status=S.SHOOT, operator=user)
        | Q(status__in=[S.EDIT], editor=user)
        | Q(status=S.DESIGN, designer=user)
        | Q(status=S.REVIEW, project__manager=user)
        | Q(status=S.REVIEW, project__manager__isnull=True, assignee=user)
        | Q(status__in=[S.IDEA, S.SCRIPT, S.READY], assignee=user)
    )


def late_q(today):
    """Joriy bosqich muddati o'tgan (nashr qilinmagan) kontentlar."""
    return (
        Q(status=S.SHOOT, shoot_at__date__lt=today)
        | Q(status__in=[S.EDIT, S.DESIGN], edit_deadline__lt=today)
        | (
            ~Q(status=S.PUBLISHED)
            & ~(Q(status=S.SHOOT) & Q(shoot_at__isnull=False))
            & ~(Q(status__in=[S.EDIT, S.DESIGN]) & Q(edit_deadline__isnull=False))
            & Q(publish_at__date__lt=today)
        )
    )


class ContentPostViewSet(viewsets.ModelViewSet):
    serializer_class = ContentPostSerializer
    filterset_fields = {
        "project": ["exact"], "project__client": ["exact"], "platform": ["exact"], "content_type": ["exact"],
        "status": ["exact", "in"], "assignee": ["exact"], "publish_at": ["gte", "lte", "date"],
        "shoot_at": ["gte", "lte"],
    }
    search_fields = ["title", "caption", "project__name"]
    ordering_fields = ["publish_at", "created_at", "shoot_at"]

    def get_queryset(self):
        qs = ContentPost.objects.select_related(
            "project__client", "project__manager", "assignee", "operator", "editor", "designer"
        )
        p = self.request.query_params
        today = timezone.localdate()
        if p.get("tab") == "mine":
            qs = qs.filter(queue_q(self.request.user))
        elif p.get("tab") == "week":
            qs = qs.filter(publish_at__date__gte=today, publish_at__date__lte=today + timedelta(days=7))
        elif p.get("tab") == "late":
            qs = qs.filter(late_q(today))
        elif p.get("tab") == "review":
            qs = qs.filter(status=S.REVIEW)
        if p.get("include_published") != "1" and not p.get("status") and not p.get("publish_at__gte"):
            qs = qs.exclude(status=S.PUBLISHED)
        return qs.distinct()

    @action(detail=False)
    def stats(self, request):
        """Bosqichlar bo'yicha sonlar va tezkor filtrlar hisoblagichlari."""
        today = timezone.localdate()
        base = ContentPost.objects.all()
        if request.query_params.get("project"):
            base = base.filter(project=request.query_params["project"])
        if request.query_params.get("content_type"):
            base = base.filter(content_type=request.query_params["content_type"])
        month_start = today.replace(day=1)
        stages = {r["status"]: r["n"] for r in base.values("status").annotate(n=Count("id"))}
        active = base.exclude(status=S.PUBLISHED)
        return Response({
            "stages": stages,
            "tabs": {
                "all": active.count(),
                "mine": active.filter(queue_q(request.user)).distinct().count(),
                "week": active.filter(publish_at__date__gte=today, publish_at__date__lte=today + timedelta(days=7)).count(),
                "late": active.filter(late_q(today)).count(),
                "review": active.filter(status=S.REVIEW).count(),
            },
            "month": {
                "in_work": active.count(),
                "published": base.filter(status=S.PUBLISHED, publish_at__date__gte=month_start).count(),
                "late": active.filter(late_q(today)).count(),
            },
        })


class ReportPermission(BasePermission):
    """Hisobotni rahbar, PM va SMM/targetolog/kopirayter tayyorlaydi; boshqalar ko'radi."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        u = request.user
        return has_role(u, "admin", "manager") or u.job in ("smm", "target", "copywriter")


class ClientReportViewSet(viewsets.ModelViewSet):
    serializer_class = ClientReportSerializer
    permission_classes = [IsAuthenticated, ReportPermission]
    filterset_fields = ["project", "status", "month"]

    def get_queryset(self):
        return ClientReport.objects.select_related("project__client")

    def perform_update(self, serializer):
        r = serializer.save()
        if r.status == ClientReport.Status.SENT and not r.sent_at:
            r.sent_at = timezone.now()
            r.save(update_fields=["sent_at"])

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Tanlangan oy uchun loyiha(lar) hisobotini yaratadi; mavjud qoralamalarni yangilaydi."""
        try:
            y, m = map(int, str(request.data.get("month", "")).split("-")[:2])
            month = date(y, m, 1)
        except ValueError:
            raise ValidationError({"month": "Oyni YYYY-MM ko'rinishida bering."})
        projects = Project.objects.filter(pk=request.data["project"]) if request.data.get("project") \
            else Project.objects.filter(status=Project.Status.ACTIVE)
        out = []
        for p in projects:
            r, created = ClientReport.objects.get_or_create(project=p, month=month,
                                                           defaults={"created_by": request.user})
            if created or r.status == ClientReport.Status.DRAFT:
                r.fill_auto()
                r.save()
            out.append(r)
        return Response(ClientReportSerializer(out, many=True).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def refresh(self, request, pk=None):
        """Avtomatik raqamlarni qayta hisoblash (qo'lda yozilgan xulosa va obunachilar saqlanadi)."""
        r = self.get_object()
        r.fill_auto()
        r.save()
        return Response(self.get_serializer(r).data)
