from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import generics, viewsets
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import User
from .permissions import IsAdminOrReadOnly
from .serializers import MeSerializer, UserSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["role", "is_active"]
    search_fields = ["username", "first_name", "last_name", "position", "phone"]


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user


@api_view(["POST"])
def change_password(request):
    user = request.user
    if not user.check_password(request.data.get("old_password", "")):
        raise ValidationError({"old_password": "Hozirgi parol noto'g'ri."})
    new = request.data.get("new_password", "")
    try:
        validate_password(new, user)
    except DjangoValidationError as e:
        raise ValidationError({"new_password": list(e.messages)})
    user.set_password(new)
    user.save(update_fields=["password"])
    return Response({"detail": "Parol yangilandi."})
