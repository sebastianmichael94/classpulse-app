from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quiz', '0011_customanalyticsprompt_question'),
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
                    ('Short Answer', 'Short Answer'),
                    ('Essay Question', 'Essay Question'),
                    ('multiple_choice_question', 'Multiple Choice'),
                    ('true_false_question', 'True/False'),
                    ('matching_question', 'Matching'),
                    ('essay_question', 'Essay'),
                    ('one_word_question', 'One Word'),
                    ('fill_in_the_blank_question', 'Fill in the Blank'),
                ],
                max_length=30,
            ),
        ),
    ]
