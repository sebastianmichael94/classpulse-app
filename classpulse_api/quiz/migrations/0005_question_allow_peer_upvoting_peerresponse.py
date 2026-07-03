from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('quiz', '0004_quiz_shared_insight_and_custom_prompt'),
    ]

    operations = [
        migrations.AddField(
            model_name='question',
            name='allow_peer_upvoting',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='PeerResponse',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student_name', models.CharField(max_length=255)),
                ('response_text', models.TextField()),
                ('upvote_count', models.IntegerField(default=0)),
                ('upvoted_by', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('question', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='peer_responses', to='quiz.question')),
                ('quiz', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='peer_responses', to='quiz.quiz')),
            ],
            options={
                'ordering': ['-upvote_count', '-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='peerresponse',
            constraint=models.UniqueConstraint(fields=('question', 'student_name'), name='unique_peer_response_per_student_question'),
        ),
    ]
