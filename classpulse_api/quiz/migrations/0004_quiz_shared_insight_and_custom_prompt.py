from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('quiz', '0003_quiz_is_shared_with_students'),
    ]

    operations = [
        migrations.AddField(
            model_name='quiz',
            name='shared_insight_text',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='quiz',
            name='shared_insight_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='CustomAnalyticsPrompt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('prompt_text', models.TextField()),
                ('response_text', models.TextField()),
                ('is_announcement', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('quiz', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='custom_prompts', to='quiz.quiz')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
