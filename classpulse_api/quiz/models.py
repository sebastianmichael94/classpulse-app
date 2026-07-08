import uuid
import random
import string
from django.contrib.auth.models import User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class Quiz(models.Model):
    STATUS_CHOICES = [
        ('READY', 'Ready'),
        ('ACTIVE', 'Active'),
        ('COMPLETED', 'Completed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    time_limit_minutes = models.PositiveIntegerField(default=15)
    duration_minutes = models.PositiveIntegerField(default=10)
    started_at = models.DateTimeField(null=True, blank=True)
    instructions = models.TextField(blank=True, null=True)
    access_code = models.CharField(max_length=6, unique=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='READY')
    created_by = models.ForeignKey(User, related_name='created_quizzes', on_delete=models.SET_NULL, blank=True, null=True)
    is_shared_with_students = models.BooleanField(default=False)
    shared_insight_text = models.TextField(blank=True, null=True)
    shared_insight_updated_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Auto-generate a secure, readable 4-digit numeric access code if not provided
        if not self.access_code:
            self.access_code = ''.join(random.choices(string.digits, k=4))
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('student', 'Student'),
        ('professor', 'Instructor'),
    ]

    SECURITY_QUESTION_CHOICES = [
        ('first_pet', "What was your first pet's name?"),
        ('birth_city', 'What city were you born in?'),
        ('first_school', 'What was the name of your first school?'),
    ]

    user = models.OneToOneField(User, related_name='profile', on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')
    security_question = models.CharField(max_length=50, choices=SECURITY_QUESTION_CHOICES, blank=True, default='')
    security_answer = models.CharField(max_length=255, blank=True, default='')

    def __str__(self):
        return f"{self.user.username} ({self.role})"


@receiver(post_save, sender=User)
def ensure_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
    else:
        UserProfile.objects.get_or_create(user=instance)

class Question(models.Model):
    QUESTION_TYPES = [
        ('Multiple Choice', 'Multiple Choice'),
        ('True/False', 'True/False'),
        ('Fill In the Blank', 'Fill In the Blank'),
        ('Matching', 'Matching'),
        ('Essay', 'Essay'),
    ]

    quiz = models.ForeignKey(Quiz, related_name='questions', on_delete=models.CASCADE)
    order_index = models.PositiveIntegerField(default=1)
    question_title = models.CharField(max_length=255)
    question_type = models.CharField(max_length=30, choices=QUESTION_TYPES)
    question_text = models.TextField()  # Dr. Reshma's raw LaTeX strings save directly here
    question_image = models.URLField(blank=True, null=True)
    interaction_data = models.JSONField(default=dict, blank=True)  # Stores choice and answer metadata
    allow_peer_upvoting = models.BooleanField(default=False)

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


class PeerResponse(models.Model):
    quiz = models.ForeignKey(Quiz, related_name='peer_responses', on_delete=models.CASCADE)
    question = models.ForeignKey(Question, related_name='peer_responses', on_delete=models.CASCADE)
    student_name = models.CharField(max_length=255)
    response_text = models.TextField()
    upvote_count = models.IntegerField(default=0)
    upvoted_by = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-upvote_count', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['question', 'student_name'], name='unique_peer_response_per_student_question')
        ]

    def __str__(self):
        return f"PeerResponse({self.student_name}, Q{self.question_id}, upvotes={self.upvote_count})"


class CustomAnalyticsPrompt(models.Model):
    quiz = models.ForeignKey(Quiz, related_name='custom_prompts', on_delete=models.CASCADE)
    question = models.ForeignKey(Question, related_name='custom_prompts', on_delete=models.SET_NULL, null=True, blank=True)
    prompt_text = models.TextField()
    response_text = models.TextField()
    is_announcement = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Custom Prompt for {self.quiz.title} @ {self.created_at.isoformat()}"