from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = User
        fields = [
            "id", "username", "password", "first_name", "last_name", "full_name", "email",
            "role", "role_display", "position", "phone", "telegram", "salary", "hired_at", "is_active",
        ]

    def get_full_name(self, obj):
        return str(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        # Maoshni faqat admin, buxgalter yoki xodimning o'zi ko'radi.
        if request and not (
            request.user.is_superuser
            or request.user.role in ("admin", "accountant")
            or request.user.pk == instance.pk
        ):
            data.pop("salary", None)
        return data

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
        fields = UserSerializer.Meta.fields + ["is_superuser", "can_see_finance"]
        read_only_fields = ["username", "role", "salary", "is_active", "is_superuser"]

    def get_can_see_finance(self, obj):
        from .permissions import can_see_finance

        return can_see_finance(obj)
