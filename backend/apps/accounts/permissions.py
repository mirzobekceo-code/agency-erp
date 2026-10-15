from rest_framework.permissions import SAFE_METHODS, BasePermission


def has_role(user, *roles):
    return bool(user and user.is_authenticated and (user.is_superuser or user.role in roles))


def can_see_finance(user):
    return has_role(user, "admin", "accountant", "manager")


class IsAdminOrReadOnly(BasePermission):
    """O'qish hammaga, o'zgartirish faqat administratorga."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user.is_authenticated
        return has_role(request.user, "admin")


class FinancePermission(BasePermission):
    """Admin va buxgalter — to'liq; menejer — faqat o'qish; mutaxassis — yo'q."""

    def has_permission(self, request, view):
        if has_role(request.user, "admin", "accountant"):
            return True
        return request.method in SAFE_METHODS and has_role(request.user, "manager")


class ManagerOrReadOnly(BasePermission):
    """Mijoz/loyiha/lidlarni admin va menejer o'zgartiradi, qolganlar ko'radi."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user.is_authenticated
        return has_role(request.user, "admin", "manager")
