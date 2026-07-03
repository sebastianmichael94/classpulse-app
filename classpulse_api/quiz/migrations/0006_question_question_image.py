from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quiz', '0005_question_allow_peer_upvoting_peerresponse'),
    ]

    operations = [
        migrations.AddField(
            model_name='question',
            name='question_image',
            field=models.URLField(blank=True, null=True),
        ),
    ]
