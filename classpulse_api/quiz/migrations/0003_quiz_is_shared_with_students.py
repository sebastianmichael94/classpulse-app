from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quiz', '0002_submission'),
    ]

    operations = [
        migrations.AddField(
            model_name='quiz',
            name='is_shared_with_students',
            field=models.BooleanField(default=False),
        ),
    ]
