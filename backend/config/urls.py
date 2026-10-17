from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path
from django.views.static import serve
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.views import MeView, UserViewSet, change_password
from apps.clients.views import ClientViewSet, ContractViewSet, LeadViewSet
from apps.content.views import ContentPostViewSet
from apps.finance.views import AdSpendViewSet, ExpenseViewSet, InvoiceViewSet, PaymentViewSet, receive_payment
from apps.projects.views import ProjectViewSet, TaskCommentViewSet, TaskViewSet, TimeEntryViewSet
from apps.reports import views as reports
from apps.team import views as team

router = DefaultRouter()
router.register("users", UserViewSet)
router.register("clients", ClientViewSet)
router.register("leads", LeadViewSet)
router.register("contracts", ContractViewSet)
router.register("projects", ProjectViewSet, basename="project")
router.register("tasks", TaskViewSet, basename="task")
router.register("task-comments", TaskCommentViewSet)
router.register("time-entries", TimeEntryViewSet, basename="timeentry")
router.register("invoices", InvoiceViewSet)
router.register("payments", PaymentViewSet)
router.register("expenses", ExpenseViewSet)
router.register("ad-spends", AdSpendViewSet)
router.register("posts", ContentPostViewSet)
router.register("payroll", team.PayrollViewSet, basename="payroll")
router.register("notes", team.NoteViewSet, basename="note")

admin.site.site_header = "Agentlik ERP"
admin.site.site_title = "Agentlik ERP"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", TokenObtainPairView.as_view()),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/auth/me/", MeView.as_view()),
    path("api/auth/password/", change_password),
    path("api/settings/", team.SettingsView.as_view()),
    path("api/attendance/day/", team.attendance_day),
    path("api/attendance/month/", team.attendance_month),
    path("api/payroll/mine/", team.my_payroll),
    path("api/reports/dashboard/", reports.dashboard),
    path("api/reports/finance/", reports.finance_report),
    path("api/reports/finance-overview/", reports.finance_overview),
    path("api/finance/receive/", receive_payment),
    path("api/reports/projects/<int:pk>/", reports.project_report),
    path("api/", include(router.urls)),
    # Yuklangan fayllar (shartnomalar). Kichik jamoa uchun yetarli; ko'p fayl bo'lsa S3/R2 ga o'tkazing.
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]


def spa_index(request):
    """React ilovasining ichki sahifalari (/tasks, /projects/1 ...) uchun index.html."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        raise Http404("Frontend yig'ilmagan: cd frontend && npm run build")
    return FileResponse(index.open("rb"), content_type="text/html")


urlpatterns += [re_path(r"^(?!api/|admin/|media/|static/).*$", spa_index)]
