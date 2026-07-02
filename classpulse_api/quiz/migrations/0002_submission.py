from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('quiz', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Submission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student_name', models.CharField(max_length=255)),
                ('answers', models.JSONField(default=list, blank=True)),
                ('score', models.IntegerField(default=0)),
                ('total_possible', models.IntegerField(default=0)),
                ('submitted_at', models.DateTimeField(auto_now_add=True)),
                ('quiz', models.ForeignKey(on_delete=models.CASCADE, related_name='submissions', to='quiz.quiz')),
            ],
            options={
                'ordering': ['-submitted_at'],
            },
        ),
    ]
