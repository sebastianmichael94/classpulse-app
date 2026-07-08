from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Quiz, Question, Submission
from .serializers import QuestionSerializer


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
        response = self.client.get(
            reverse('quiz-analytics', kwargs={'pk': self.quiz.pk}),
            {'question_id': self.question.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('common_misconceptions', response.data)
        self.assertIn('key_themes_detected', response.data)
        self.assertIsInstance(response.data['common_misconceptions'], list)
        self.assertIsInstance(response.data['key_themes_detected'], list)


class StructuredChoiceSchemaTests(TestCase):
    def setUp(self):
        self.quiz = Quiz.objects.create(
            title='Structured Choice Quiz',
            time_limit_minutes=10,
            instructions='Choice schema test quiz',
            status='READY',
        )

    def test_question_serializer_normalizes_legacy_option_strings(self):
        serializer = QuestionSerializer(data={
            'order_index': 1,
            'question_title': 'Derivative Check',
            'question_type': 'Multiple Choice',
            'question_text': 'What is $d/dx(x^2)$?',
            'interaction_data': {
                'options': ['2x', 'x', '1'],
                'correct_index': 0,
            },
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        normalized_options = serializer.validated_data['interaction_data']['options']
        self.assertEqual(normalized_options[0]['id'], 'A')
        self.assertEqual(normalized_options[0]['text'], '2x')
        self.assertIsNone(normalized_options[0]['image_url'])

    def test_question_serializer_represents_legacy_stored_options_as_objects(self):
        question = Question.objects.create(
            quiz=self.quiz,
            order_index=1,
            question_title='Legacy options',
            question_type='Multiple Choice',
            question_text='Legacy format',
            interaction_data={
                'options': ['Alpha', 'Beta'],
                'correct_index': 0,
            },
        )

        serializer = QuestionSerializer(instance=question)
        output_options = serializer.data['interaction_data']['options']
        self.assertEqual(output_options[0]['id'], 'A')
        self.assertEqual(output_options[0]['text'], 'Alpha')
        self.assertIsNone(output_options[0]['image_url'])

    def test_choice_image_upload_endpoint_returns_choice_image_url(self):
        client = APIClient()
        image_file = SimpleUploadedFile(
            'diagram.png',
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR',
            content_type='image/png',
        )

        response = client.post('/api/assets/choice-image/', {'image': image_file}, format='multipart')

        self.assertEqual(response.status_code, 201)
        self.assertIn('image_url', response.data)
        self.assertTrue(str(response.data['image_url']).startswith('http'))

    def test_question_serializer_normalizes_matching_schema(self):
        serializer = QuestionSerializer(data={
            'order_index': 2,
            'question_title': 'Match each expression',
            'question_type': 'Matching',
            'question_text': 'Match left items to right options',
            'interaction_data': {
                'left_items': [
                    {'text': '$x^2$'},
                    {'text': '$\\sin(x)$'},
                ],
                'right_options': [
                    {'text': 'Quadratic'},
                    {'text': 'Trigonometric'},
                    {'text': 'Distractor'},
                ],
                'correct_mapping': {
                    'L1': 'R1',
                    'L2': 'R2',
                },
            },
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        interaction = serializer.validated_data['interaction_data']
        self.assertEqual(interaction['left_items'][0]['id'], 'L1')
        self.assertEqual(interaction['right_options'][2]['id'], 'R3')
        self.assertEqual(interaction['correct_mapping']['L2'], 'R2')


class SubmissionNoRetakeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.quiz = Quiz.objects.create(
            title='No Retake Quiz',
            time_limit_minutes=10,
            duration_minutes=10,
            instructions='Retake guard test',
            status='ACTIVE',
            started_at=timezone.now(),
        )
        self.question = Question.objects.create(
            quiz=self.quiz,
            order_index=1,
            question_title='Single choice',
            question_type='Multiple Choice',
            question_text='Pick one',
            interaction_data={
                'options': ['A', 'B', 'C'],
                'correct_index': 0,
            },
        )

    def test_duplicate_submission_is_blocked_case_insensitive(self):
        payload = {
            'quiz': str(self.quiz.id),
            'student_name': 'Ada',
            'answers': [
                {
                    'question_id': self.question.id,
                    'question_type': 'Multiple Choice',
                    'answer': 'A',
                }
            ],
        }

        first = self.client.post('/api/submissions/', payload, format='json')
        self.assertEqual(first.status_code, 201)

        second_payload = {
            **payload,
            'student_name': ' ada ',
        }
        second = self.client.post('/api/submissions/', second_payload, format='json')
        self.assertEqual(second.status_code, 403)
        self.assertIn('error', second.data)


class MatchingGradingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.quiz = Quiz.objects.create(
            title='Matching Quiz',
            time_limit_minutes=10,
            duration_minutes=10,
            instructions='Matching grading test',
            status='ACTIVE',
            started_at=timezone.now(),
        )
        self.question = Question.objects.create(
            quiz=self.quiz,
            order_index=1,
            question_title='Match concepts',
            question_type='Matching',
            question_text='Match each left concept to the right category.',
            interaction_data={
                'left_items': [
                    {'id': 'L1', 'text': '$x^2$'},
                    {'id': 'L2', 'text': '$\\sin(x)$'},
                ],
                'right_options': [
                    {'id': 'R1', 'text': 'Quadratic'},
                    {'id': 'R2', 'text': 'Trigonometric'},
                    {'id': 'R3', 'text': 'Distractor'},
                ],
                'correct_mapping': {
                    'L1': 'R1',
                    'L2': 'R2',
                },
            },
        )

    def test_matching_submission_scores_when_all_pairs_correct(self):
        payload = {
            'quiz': str(self.quiz.id),
            'student_name': 'Grace',
            'answers': [
                {
                    'question_id': self.question.id,
                    'question_type': 'Matching',
                    'answer': {
                        'L1': 'R1',
                        'L2': 'R2',
                    },
                }
            ],
        }

        response = self.client.post('/api/submissions/', payload, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get('score'), 1)
        self.assertEqual(response.data.get('total_possible'), 1)
