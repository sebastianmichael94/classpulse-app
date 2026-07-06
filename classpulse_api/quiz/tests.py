from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Quiz, Question, Submission


class AnalyticsEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.quiz = Quiz.objects.create(
            title='AI Basics',
            time_limit_minutes=10,
            instructions='Test quiz',
            status='READY',
        )
        self.question = Question.objects.create(
            quiz=self.quiz,
            order_index=1,
            question_title='Essay Prompt',
            question_type='essay_question',
            question_text='Explain the concept.',
            interaction_data={},
        )
        Submission.objects.create(
            quiz=self.quiz,
            student_name='Ada',
            answers=[{
                'question_id': self.question.id,
                'question_type': 'essay_question',
                'answer': 'The concept is useful but needs more clarity and examples.'
            }],
            score=1,
            total_possible=1,
        )

    def test_analytics_endpoint_returns_ai_summary_fields(self):
        response = self.client.get(reverse('quiz-analytics', kwargs={'pk': self.quiz.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertIn('common_misconceptions', response.data)
        self.assertIn('key_themes_detected', response.data)
        self.assertTrue(response.data['common_misconceptions'])
        self.assertTrue(response.data['key_themes_detected'])
