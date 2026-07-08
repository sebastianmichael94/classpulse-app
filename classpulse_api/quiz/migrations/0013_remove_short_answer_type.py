from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quiz', '0012_alter_question_question_type_matching'),
    ]

    operations = [
        migrations.AlterField(
            model_name='question',
            name='question_type',
            field=models.CharField(
                choices=[
                    ('Multiple Choice', 'Multiple Choice'),
                    ('True/False', 'True/False'),
                    ('Fill In the Blank', 'Fill In the Blank'),
                    ('Matching', 'Matching'),
                    ('Essay', 'Essay'),
                ],
                max_length=30,
            ),
        ),
    ]
