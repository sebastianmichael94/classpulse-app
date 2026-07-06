from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('quiz', '0010_quiz_duration_minutes_quiz_started_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='customanalyticsprompt',
            name='question',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='custom_prompts', to='quiz.question'),
        ),
    ]
