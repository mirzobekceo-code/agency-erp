from rest_framework.permissions import SAFE_METHODS, BasePermission


def has_role(user, *roles):
    return bool(user and user.is_authenticated and (user.is_superuser or user.role in roles))


def can_see_finance(user):
    return has_role(user, "admin", "accountant", "manager")


class IsAdminOrReadOnly(BasePermission):
    """Xodimlar ro'yxati: o'qish hammaga, o'zgartirish rahbar va HR ga."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user.is_authenticated
        return has_role(request.user, "admin", "hr")


def sees_all_leads(user):
    return has_role(user, "admin", "manager", "sales")


class PayrollPermission(BasePermission):
    """Oylik vedomost: rahbar va buxgalter — to'liq; HR — ko'rish."""

    def has_permission(self, request, view):
        if has_role(request.user, "admin", "accountant"):
            return True
        return request.method in SAFE_METHODS and has_role(request.user, "hr")


class FinancePermission(BasePermission):
    """Admin va buxgalter — to'liq; menejer — faqat o'qish; mutaxassis — yo'q."""

    def has_permission(self, request, view):
        if has_role(request.user, "admin", "accountant"):
            return True
        return request.method in SAFE_METHODS and has_role(request.user, "manager")


class ManagerOrReadOnly(BasePermission):
    """Mijoz/loyiha/lidlarni rahbar, PM va B2B manager o'zgartiradi, qolganlar ko'radi."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user.is_authenticated
        return has_role(request.user, "admin", "manager", "sales")
