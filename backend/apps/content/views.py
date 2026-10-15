from rest_framework import viewsets

from .models import ContentPost
from .serializers import ContentPostSerializer


class ContentPostViewSet(viewsets.ModelViewSet):
    queryset = ContentPost.objects.select_related("project__client", "assignee")
    serializer_class = ContentPostSerializer
    filterset_fields = {
        "project": ["exact"], "project__client": ["exact"], "platform": ["exact"],
        "status": ["exact", "in"], "assignee": ["exact"], "publish_at": ["gte", "lte", "date"],
    }
    search_fields = ["title", "caption", "project__name"]
    ordering_fields = ["publish_at", "created_at"]
