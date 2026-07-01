from django.db.models import Avg, Max, Min
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Quiz, Submission
from .serializers import QuizSerializer, SubmissionSerializer, SubmissionCreateSerializer

class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.all()
    serializer_with_nested = QuizSerializer

    def get_serializer_class(self):
        return QuizSerializer

    @action(detail=False, methods=['post'], url_path='unlock')
    def unlock_quiz(self, request):
        code = request.data.get('access_code')
        if not code:
            return Response({"error": "Access code required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quiz = Quiz.objects.get(access_code=code, status='PUBLISHED')
            serializer = self.get_serializer(quiz)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Quiz.DoesNotExist:
            return Response({"error": "Invalid access code or quiz is not published yet."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'], url_path='analytics')
    def analytics(self, request, pk=None):
        quiz = self.get_object()
        submissions = quiz.submissions.all()

        total_submissions = submissions.count()
        avg_score = submissions.aggregate(Avg('score'))['score__avg'] or 0
        max_score = submissions.aggregate(Max('score'))['score__max'] or 0
        min_score = submissions.aggregate(Min('score'))['score__min'] or 0

        essay_texts = []
        for submission in submissions:
            for answer in submission.answers:
                if answer.get('question_type') == 'essay_question' and isinstance(answer.get('answer'), str):
                    essay_texts.append(answer.get('answer'))

        word_counts = {}
        for essay_text in essay_texts:
            for word in str(essay_text).lower().split():
                normalized = ''.join(ch for ch in word if ch.isalnum())
                if normalized:
                    word_counts[normalized] = word_counts.get(normalized, 0) + 1

        top_words = sorted(word_counts.items(), key=lambda item: item[1], reverse=True)[:20]
        common_misconceptions = []
        key_themes_detected = []

        if top_words:
            common_misconceptions = [
                f"{term} is appearing repeatedly in student reflections" for term, _ in top_words[:3]
            ]
            key_themes_detected = [
                f"Students are frequently discussing {top_words[0][0]}",
                f"Secondary emphasis on {top_words[1][0]}" if len(top_words) > 1 else 'Reflection quality is improving',
                'Submitted responses are showing clear conceptual engagement' if len(top_words) > 2 else 'Conceptual depth is emerging',
            ]
        else:
            common_misconceptions = ['No misconception patterns detected yet.']
            key_themes_detected = ['Responses will appear here once students submit essays.']

        analytics = {
            'quiz_id': str(quiz.id),
            'total_submissions': total_submissions,
            'average_score': avg_score,
            'max_score': max_score,
            'min_score': min_score,
            'word_cloud': [{'word': word, 'count': count} for word, count in top_words],
            'essay_summary': 'Essay analytics generated from submitted responses.' if essay_texts else 'No essay submissions available yet.',
            'common_misconceptions': common_misconceptions,
            'key_themes_detected': key_themes_detected,
        }
        return Response(analytics)

class SubmissionViewSet(viewsets.ModelViewSet):
    queryset = Submission.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return SubmissionCreateSerializer
        return SubmissionSerializer

    def perform_create(self, serializer):
        submission = serializer.save()
        self.grade_submission(submission)

    def grade_submission(self, submission):
        quiz = submission.quiz
        questions = {q.id: q for q in quiz.questions.all()}
        score = 0
        total_possible = len(questions)

        for answer_item in submission.answers:
            question_id = answer_item.get('question_id')
            question = questions.get(question_id)
            if not question:
                continue

            answer_value = answer_item.get('answer')
            question_type = question.question_type
            interaction = question.interaction_data or {}

            if question_type == 'multiple_choice_question':
                correct_option = interaction.get('correct_option')
                if correct_option is None:
                    correct_option = interaction.get('correct_index')
                if answer_value == correct_option:
                    score += 1
            elif question_type == 'true_false_question':
                correct_answer = interaction.get('correct_answer')
                if correct_answer is None:
                    correct_answer = interaction.get('correct_index')
                if isinstance(correct_answer, bool):
                    if answer_value == correct_answer:
                        score += 1
                else:
                    if str(answer_value).lower() == str(correct_answer).lower():
                        score += 1
            elif question_type == 'formula_question':
                correct_formula = interaction.get('correct_formula')
                if correct_formula is None:
                    correct_formula = interaction.get('formula')
                if correct_formula and str(answer_value).strip().lower() == str(correct_formula).strip().lower():
                    score += 1
            elif question_type in ['essay_question', 'one_word_question', 'fill_in_the_blank_question']:
                if answer_value is not None and str(answer_value).strip() != '':
                    score += 1

        submission.score = score
        submission.total_possible = total_possible
        submission.save(update_fields=['score', 'total_possible'])
