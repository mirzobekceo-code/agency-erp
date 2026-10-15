from rest_framework import generics, viewsets

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
