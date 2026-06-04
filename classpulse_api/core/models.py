from django.db import models
from django.contrib.auth.models import User

class Course(models.Model):
    name = models.CharField(max_length=255)
    professor = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return self.name

class QuizSession(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    access_code = models.CharField(max_length=6, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Question(models.Model):
    QUESTION_TYPES = [
        ('MCQ', 'Multiple Choice'),
        ('TF', 'True/False'),
        ('ESSAY', 'Essay Question'),
        ('WORD', 'One Word'),
        ('MULT_ANS', 'Multiple Answers'),
        ('MATCHING', 'Matching'),
        ('NUMERICAL', 'Numerical Answer'),
        ('FORMULA', 'Formula Question'),
        ('FILE_UPLOAD', 'File Upload Question'),
    ]
    session = models.ForeignKey(QuizSession, on_delete=models.CASCADE)
    text = models.TextField()
    type = models.CharField(max_length=15, choices=QUESTION_TYPES, default='MCQ')
    options = models.JSONField(blank=True, null=True) 
    correct_metadata = models.JSONField(blank=True, null=True)

class Response(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='quiz_responses')
    answer_data = models.JSONField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.username} - Question {self.question.id}"