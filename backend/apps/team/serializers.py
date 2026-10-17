from rest_framework import serializers

from .models import AgencySettings, Attendance, Note, NoteMessage, PayrollEntry


class AgencySettingsSerializer(serializers.ModelSerializer):
    attendance_manager_name = serializers.StringRelatedField(source="attendance_manager", read_only=True)
    # Token hech qachon qaytarilmaydi — faqat sozlanganmi yoki yo'qmi
    telegram_bot_token = serializers.CharField(write_only=True, required=False, allow_blank=True)
    telegram_configured = serializers.SerializerMethodField()
    cron_url = serializers.SerializerMethodField()

    class Meta:
        model = AgencySettings
        exclude = ["id", "last_digest_date"]

    def get_telegram_configured(self, obj):
        from .telegram import bot_token

        return bool(bot_token(obj))

    def get_cron_url(self, obj):
        """Kunlik xulosa uchun tashqi cron havolasi — faqat rahbarga ko'rinadi."""
        import os

        from .telegram import site_url

        req = self.context.get("request")
        secret = os.getenv("CRON_SECRET", "")
        if not (req and req.user.is_admin and secret):
            return None
        base = site_url() or req.build_absolute_uri("/").rstrip("/")
        return f"{base}/api/cron/daily/?key={secret}"

    def update(self, instance, validated_data):
        # Bo'sh token yuborilsa — mavjudi saqlanib qoladi (forma har safar tokenni ko'rsatmaydi)
        if not validated_data.get("telegram_bot_token"):
            validated_data.pop("telegram_bot_token", None)
        return super().update(instance, validated_data)


class AttendanceRowSerializer(serializers.Serializer):
    """Kunlik belgilashdagi bitta qator (yaratish/yangilash/o'chirish)."""

    user = serializers.IntegerField()
    status = serializers.ChoiceField(choices=[""] + list(Attendance.Status.values), allow_blank=True, required=False)
    check_in = serializers.TimeField(allow_null=True, required=False)
    check_out = serializers.TimeField(allow_null=True, required=False)
    left_with_permission = serializers.BooleanField(required=False, default=False)
    note = serializers.CharField(allow_blank=True, required=False, default="")


class PayrollEntrySerializer(serializers.ModelSerializer):
    user_name = serializers.StringRelatedField(source="user", read_only=True)
    position = serializers.CharField(source="user.position", read_only=True)
    net = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = PayrollEntry
        fields = "__all__"
        read_only_fields = ["user", "pay_date", "period_start", "period_end", "fines", "paid_amount"]

    def validate(self, attrs):
        inst = self.instance
        waived = attrs.get("fines_waived", inst.fines_waived if inst else 0)
        if inst and waived > inst.fines:
            raise serializers.ValidationError({"fines_waived": "Kechirilgan summa jarimadan oshmasligi kerak."})
        for f in ("bonus", "advance", "fines_waived"):
            if attrs.get(f) is not None and attrs[f] < 0:
                raise serializers.ValidationError({f: "Manfiy bo'lishi mumkin emas."})
        return attrs


class NoteMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.StringRelatedField(source="author", read_only=True)

    class Meta:
        model = NoteMessage
        fields = ["id", "note", "author", "author_name", "text", "created_at"]
        read_only_fields = ["author", "note"]


class NoteSerializer(serializers.ModelSerializer):
    author_name = serializers.StringRelatedField(source="author", read_only=True)
    project_name = serializers.StringRelatedField(source="project", read_only=True)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    messages_count = serializers.IntegerField(source="messages.count", read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = "__all__"
        read_only_fields = ["author"]

    def get_can_edit(self, obj):
        request = self.context.get("request")
        return bool(request and (obj.author_id == request.user.pk or request.user.is_admin))
