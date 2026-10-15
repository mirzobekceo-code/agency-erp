from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.views import MeView, UserViewSet
from apps.clients.views import ClientViewSet, ContractViewSet, LeadViewSet
from apps.content.views import ContentPostViewSet
from apps.finance.views import AdSpendViewSet, ExpenseViewSet, InvoiceViewSet, PaymentViewSet
from apps.projects.views import ProjectViewSet, TaskCommentViewSet, TaskViewSet, TimeEntryViewSet
from apps.reports import views as reports

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

admin.site.site_header = "Agentlik ERP"
admin.site.site_title = "Agentlik ERP"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", TokenObtainPairView.as_view()),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/auth/me/", MeView.as_view()),
    path("api/reports/dashboard/", reports.dashboard),
    path("api/reports/finance/", reports.finance_report),
    path("api/reports/projects/<int:pk>/", reports.project_report),
    path("api/", include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
