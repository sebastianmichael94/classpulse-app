import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Quiz",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("title", models.CharField(max_length=255)),
                ("time_limit_minutes", models.PositiveIntegerField(default=15)),
                ("instructions", models.TextField(blank=True, null=True)),
                ("access_code", models.CharField(max_length=6, unique=True, blank=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("PUBLISHED", "Published"),
                        ],
                        default="DRAFT",
                        max_length=10,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="Question",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("order_index", models.PositiveIntegerField(default=1)),
                ("question_title", models.CharField(max_length=255)),
                (
                    "question_type",
                    models.CharField(
                        choices=[
                            ("multiple_choice_question", "Multiple Choice"),
                            ("true_false_question", "True/False"),
                            ("essay_question", "Essay"),
                            ("formula_question", "Formula"),
                        ],
                        max_length=30,
                    ),
                ),
                ("question_text", models.TextField()),
                (
                    "interaction_data",
                    models.JSONField(default=dict, blank=True),
                ),
                (
                    "quiz",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="questions",
                        to="quiz.quiz",
                    ),
                ),
            ],
            options={"ordering": ["order_index"]},
        ),
    ]
