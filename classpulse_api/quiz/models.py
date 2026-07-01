import uuid
import random
import string
from django.db import models

class Quiz(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('PUBLISHED', 'Published'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    time_limit_minutes = models.PositiveIntegerField(default=15)
    instructions = models.TextField(blank=True, null=True)
    access_code = models.CharField(max_length=6, unique=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='DRAFT')
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Auto-generate a secure, readable 4-digit numeric access code if not provided
        if not self.access_code:
            self.access_code = ''.join(random.choices(string.digits, k=4))
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title

class Question(models.Model):
    QUESTION_TYPES = [
        ('multiple_choice_question', 'Multiple Choice'),
        ('true_false_question', 'True/False'),
        ('essay_question', 'Essay'),
        ('formula_question', 'Formula'),
        ('one_word_question', 'One Word'),
        ('fill_in_the_blank_question', 'Fill in the Blank'),
    ]

    quiz = models.ForeignKey(Quiz, related_name='questions', on_delete=models.CASCADE)
    order_index = models.PositiveIntegerField(default=1)
    question_title = models.CharField(max_length=255)
    question_type = models.CharField(max_length=30, choices=QUESTION_TYPES)
    question_text = models.TextField()  # Dr. Reshma's raw LaTeX strings save directly here
    interaction_data = models.JSONField(default=dict, blank=True)  # Stores options, ranges, formulas

    class Meta:
        ordering = ['order_index']

    def __str__(self):
        return f"{self.quiz.title} - Q{self.order_index}: {self.question_title}"


class Submission(models.Model):
    quiz = models.ForeignKey(Quiz, related_name='submissions', on_delete=models.CASCADE)
    student_name = models.CharField(max_length=255)
    answers = models.JSONField(default=list, blank=True)
    score = models.IntegerField(default=0)
    total_possible = models.IntegerField(default=0)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f"{self.student_name} - {self.quiz.title} @ {self.submitted_at.isoformat()}"