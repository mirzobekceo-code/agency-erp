from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    job_display = serializers.CharField(source="get_job_display", read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = User
        fields = [
            "id", "username", "password", "first_name", "last_name", "full_name", "email",
            "role", "role_display", "position", "phone", "telegram", "salary", "hired_at", "is_active",
            "work_format", "employee_type", "track_attendance", "job", "job_display",
        ]

    def get_full_name(self, obj):
        return str(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        # Maoshni faqat admin, buxgalter yoki xodimning o'zi ko'radi.
        if request and not (
            request.user.is_superuser
            or request.user.role in ("admin", "accountant", "hr")
            or request.user.pk == instance.pk
        ):
            data.pop("salary", None)
        return data

    def to_internal_value(self, data):
        # Bo'sh rol = "lavozimdan avtomatik"
        if data.get("role") in ("", None) and "role" in data:
            data = data.copy()
            data.pop("role")
        return super().to_internal_value(data)

    def validate(self, attrs):
        # Lavozim tanlanib, rol aniq berilmagan bo'lsa — rol lavozimdan olinadi
        if "job" in attrs and "role" not in attrs:
            attrs["role"] = User.JOB_ROLE.get(attrs["job"], "specialist")
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class MeSerializer(UserSerializer):
    can_see_finance = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["is_superuser", "can_see_finance", "can_mark_attendance"]
        read_only_fields = ["username", "role", "salary", "is_active", "is_superuser", "work_format",
                            "employee_type", "track_attendance", "job"]

    def get_can_see_finance(self, obj):
        from .permissions import can_see_finance

        return can_see_finance(obj)

    can_mark_attendance = serializers.SerializerMethodField()

    def get_can_mark_attendance(self, obj):
        from apps.team.views import can_mark_attendance

        return can_mark_attendance(obj)
