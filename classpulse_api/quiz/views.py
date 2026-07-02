import re
from django.db.models import Avg, Max, Min
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Quiz, Submission
from .serializers import QuizSerializer, SubmissionSerializer, SubmissionCreateSerializer

STOP_WORDS = {
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have',
    'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'this',
    'to', 'was', 'were', 'will', 'with', 'you', 'your', 'about', 'can', 'could', 'more', 'than',
    'very', 'not', 'what', 'when', 'which', 'who', 'why', 'how'
}


class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.all()
    serializer_class = QuizSerializer

    def get_serializer_class(self):
        return QuizSerializer

    @action(detail=False, methods=['post'], url_path='unlock')
    def unlock_quiz(self, request):
        code = request.data.get('access_code')
        if not code:
            return Response({'error': 'Access code required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quiz = Quiz.objects.get(access_code=str(code).strip(), status='PUBLISHED')
        except Quiz.DoesNotExist:
            return Response({'error': 'Invalid access code or quiz is not published yet.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(quiz)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='analytics')
    def analytics(self, request, pk=None):
        quiz = self.get_object()
        submissions = quiz.submissions.all()

        total_submissions = submissions.count()
        avg_score = submissions.aggregate(Avg('score'))['score__avg'] or 0
        max_score = submissions.aggregate(Max('score'))['score__max'] or 0
        min_score = submissions.aggregate(Min('score'))['score__min'] or 0

        essay_texts = []
        short_texts = []
        for submission in submissions:
            for answer in submission.answers or []:
                if not isinstance(answer, dict):
                    continue
                answer_value = answer.get('answer')
                question_type = answer.get('question_type')
                if question_type == 'essay_question' and isinstance(answer_value, str) and answer_value.strip():
                    essay_texts.append(answer_value.strip())
                elif question_type in {'one_word_question', 'fill_in_the_blank_question'} and isinstance(answer_value, str) and answer_value.strip():
                    short_texts.append(answer_value.strip())

        word_counts = {}
        for short_text in short_texts:
            tokens = re.findall(r"[a-zA-Z]+", short_text.lower())
            for token in tokens:
                if token in STOP_WORDS or len(token) <= 2:
                    continue
                word_counts[token] = word_counts.get(token, 0) + 1

        top_words = sorted(word_counts.items(), key=lambda item: item[1], reverse=True)[:20]

        if essay_texts:
            essay_word_counts = {}
            for essay_text in essay_texts:
                for token in re.findall(r"[a-zA-Z]+", essay_text.lower()):
                    if token in STOP_WORDS or len(token) <= 2:
                        continue
                    essay_word_counts[token] = essay_word_counts.get(token, 0) + 1

            top_essay_words = sorted(essay_word_counts.items(), key=lambda item: item[1], reverse=True)[:3]
            common_misconceptions = [f"Students repeatedly mentioned {word}" for word, _ in top_essay_words] or ['No recurring misconception pattern detected yet.']
            key_themes_detected = [f"Conceptual focus on {word}" for word, _ in top_essay_words] or ['Essay responses are still emerging.']
            class_confidence_index = round(min(0.95, max(0.2, 0.45 + (len(essay_texts) * 0.07) + (len(top_essay_words) * 0.04))), 2)
        else:
            common_misconceptions = ['No essay responses yet.']
            key_themes_detected = ['Waiting for student essay submissions.']
            class_confidence_index = 0.0

        analytics = {
            'quiz_id': str(quiz.id),
            'total_submissions': total_submissions,
            'average_score': avg_score,
            'max_score': max_score,
            'min_score': min_score,
            'word_cloud': [{'word': word, 'count': count} for word, count in top_words],
            'essay_summary': {
                'common_misconceptions': common_misconceptions,
                'key_themes_detected': key_themes_detected,
                'class_confidence_index': class_confidence_index,
            },
            'common_misconceptions': common_misconceptions,
            'key_themes_detected': key_themes_detected,
            'class_confidence_index': class_confidence_index,
        }
        return Response(analytics)


class SubmissionViewSet(viewsets.ModelViewSet):
    queryset = Submission.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return SubmissionCreateSerializer
        return SubmissionSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = serializer.save()
        self.grade_submission(submission)
        response_serializer = SubmissionSerializer(submission)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def grade_submission(self, submission):
        quiz = submission.quiz
        questions = {q.id: q for q in quiz.questions.all()}
        score = 0
        total_possible = len(questions)

        for answer_item in submission.answers or []:
            if not isinstance(answer_item, dict):
                continue

            question_id = answer_item.get('question_id')
            question = questions.get(question_id)
            if not question:
                continue

            answer_value = answer_item.get('answer')
            question_type = question.question_type
            interaction = question.interaction_data or {}

            if question_type == 'multiple_choice_question':
                correct_index = interaction.get('correct_index')
                if correct_index is None:
                    correct_index = interaction.get('correct_option')
                options = interaction.get('options') or []
                if isinstance(answer_value, (int, float)) and int(answer_value) == int(correct_index):
                    score += 1
                elif isinstance(answer_value, str):
                    if str(answer_value).strip() == str(correct_index).strip():
                        score += 1
                    elif isinstance(options, list) and str(answer_value).strip() == str(options[int(correct_index)]).strip():
                        score += 1
            elif question_type == 'true_false_question':
                correct_index = interaction.get('correct_index')
                if correct_index is None:
                    correct_index = interaction.get('correct_option')
                expected_value = 'True' if int(correct_index) == 0 else 'False' if int(correct_index) == 1 else None
                if expected_value:
                    if isinstance(answer_value, bool):
                        if (answer_value and expected_value == 'True') or (not answer_value and expected_value == 'False'):
                            score += 1
                    elif isinstance(answer_value, str):
                        if answer_value.strip().lower() == expected_value.lower():
                            score += 1
                    elif isinstance(answer_value, (int, float)):
                        if int(answer_value) == int(correct_index):
                            score += 1
            elif question_type == 'formula_question':
                variables = interaction.get('variables') or {}
                try:
                    numeric_answer = float(answer_value)
                except (TypeError, ValueError):
                    numeric_answer = None

                if numeric_answer is not None:
                    for variable_config in variables.values():
                        if isinstance(variable_config, dict):
                            min_value = variable_config.get('min')
                            max_value = variable_config.get('max')
                            if isinstance(min_value, (int, float)) and isinstance(max_value, (int, float)):
                                if min_value <= numeric_answer <= max_value:
                                    score += 1
                                    break
            elif question_type in ['essay_question', 'one_word_question', 'fill_in_the_blank_question']:
                if answer_value is not None and str(answer_value).strip() != '':
                    score += 1

        submission.score = score
        submission.total_possible = total_possible
        submission.save(update_fields=['score', 'total_possible'])
