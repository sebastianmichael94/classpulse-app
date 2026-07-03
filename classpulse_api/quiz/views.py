import re
import json
import os
import uuid
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Avg, Max, Min, F
from django.utils import timezone
from django.core.files.storage import default_storage
from rest_framework import viewsets, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Quiz, Question, Submission, CustomAnalyticsPrompt, PeerResponse
from .serializers import (
    QuizSerializer,
    SubmissionSerializer,
    SubmissionCreateSerializer,
    PeerResponseSerializer,
    RegisterSerializer,
    LoginSerializer,
)

STOP_WORDS = {
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have',
    'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'this',
    'to', 'was', 'were', 'will', 'with', 'you', 'your', 'about', 'can', 'could', 'more', 'than',
    'very', 'not', 'what', 'when', 'which', 'who', 'why', 'how'
}

QUESTION_TYPE_ALIAS_MAP = {
    'multiple_choice_question': 'Multiple Choice',
    'true_false_question': 'True/False',
    'fill_in_the_blank_question': 'Fill In the Blank',
    'one_word_question': 'Fill In the Blank',
    'formula_question': 'Formula Question',
    'essay_question': 'Essay Question',
}


def normalize_question_type(question_type):
    if not question_type:
        return 'Essay Question'
    normalized = str(question_type).strip()
    return QUESTION_TYPE_ALIAS_MAP.get(normalized, normalized)


def index_to_choice_label(index_value):
    try:
        numeric_index = int(index_value)
    except (TypeError, ValueError):
        return None

    if numeric_index < 0:
        return None

    return chr(ord('A') + numeric_index)


TEXT_BASED_TYPES = {
    'Essay Question',
    'Fill In the Blank',
    'Fill In Multiple Blanks',
    'Multiple Dropdowns',
    'File Upload Question',
}

SHORT_TEXT_TYPES = {
    'Essay Question',
    'Fill In the Blank',
    'Fill In Multiple Blanks',
    'Multiple Dropdowns',
}


def extract_textual_answer(answer_value):
    if isinstance(answer_value, str):
        cleaned = answer_value.strip()
        return cleaned if cleaned else None

    if isinstance(answer_value, dict):
        joined = [str(value).strip() for value in answer_value.values() if str(value).strip()]
        return ' | '.join(joined) if joined else None

    return None


def build_student_context(quiz):
    lines = []
    for submission in quiz.submissions.all():
        for answer in submission.answers or []:
            if not isinstance(answer, dict):
                continue

            question_type = normalize_question_type(answer.get('question_type'))
            if question_type not in TEXT_BASED_TYPES:
                continue

            textual_answer = extract_textual_answer(answer.get('answer'))
            if textual_answer:
                lines.append(f"{submission.student_name}: {textual_answer}")

    if not lines:
        return 'No text-based student answers have been submitted yet.'

    context = '\n'.join(lines)
    return context[:18000]


def fallback_synthesis(custom_prompt, student_context):
    snippets = []
    for line in student_context.splitlines()[:4]:
        if line.strip():
            snippets.append(line.strip())

    if not snippets:
        snippets = ['No textual student response snippets are available right now.']

    return (
        f"Professor query: {custom_prompt.strip()}\n"
        f"Live synthesis:\n"
        f"- {snippets[0]}\n"
        f"- {snippets[1] if len(snippets) > 1 else 'Responses are still gathering momentum.'}\n"
        f"- {snippets[2] if len(snippets) > 2 else 'Encourage students to provide specific reasoning for better clustering.'}\n"
        f"- {snippets[3] if len(snippets) > 3 else 'Use this insight to address misconceptions in the next explanation cycle.'}"
    )


def call_llm_response(custom_prompt, student_context):
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return fallback_synthesis(custom_prompt, student_context)

    system_prompt = (
        'You are an expert teaching assistant analyzing live classroom responses. '
        f"Here is the custom request from Professor Reshma: {custom_prompt}. "
        f"Use this raw student data context to synthesize your answer: {student_context}. "
        'Return concise, educator-friendly insights in 4 to 6 bullet points.'
    )

    payload = {
        'model': 'gpt-4o-mini',
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': custom_prompt},
        ],
        'temperature': 0.3,
    }

    req = urllib_request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    try:
        with urllib_request.urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode('utf-8'))
            text = data.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
            return text or fallback_synthesis(custom_prompt, student_context)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return fallback_synthesis(custom_prompt, student_context)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        username = data['username'].strip()
        email = data['email'].strip().lower()
        role = data['role']

        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email=email).exists():
            return Response({'error': 'Email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(
            username=username,
            email=email,
            password=data['password'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
        )
        user.profile.role = role
        user.profile.save(update_fields=['role'])

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'message': 'Registration successful.',
            'token': token.key,
            'user': {
                'id': user.id,
                'name': f"{user.first_name} {user.last_name}".strip() or user.username,
                'username': user.username,
                'email': user.email,
                'role': user.profile.role,
            },
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username'].strip()
        password = serializer.validated_data['password']

        user = authenticate(username=username, password=password)
        if user is None:
            user_by_email = User.objects.filter(email=username).first()
            if user_by_email:
                user = authenticate(username=user_by_email.username, password=password)

        if user is None:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'message': 'Login successful.',
            'token': token.key,
            'user': {
                'id': user.id,
                'name': f"{user.first_name} {user.last_name}".strip() or user.username,
                'username': user.username,
                'email': user.email,
                'role': getattr(user.profile, 'role', 'student'),
            },
        }, status=status.HTTP_200_OK)


class ProfessorQuizHistoryView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(getattr(request.user, 'profile', None), 'role', None)
        if role != 'professor':
            return Response({'error': 'Professor access required.'}, status=status.HTTP_403_FORBIDDEN)

        quizzes = Quiz.objects.filter(created_by=request.user).order_by('-created_at')
        history = []
        for quiz in quizzes:
            submission_count = quiz.submissions.count()
            has_ai_summary_cached = bool(
                (quiz.shared_insight_text and str(quiz.shared_insight_text).strip())
                or quiz.custom_prompts.exists()
                or submission_count > 0
            )
            history.append({
                'id': str(quiz.id),
                'title': quiz.title,
                'created_at': quiz.created_at.isoformat(),
                'total_submissions': submission_count,
                'has_ai_summary_cached': has_ai_summary_cached,
            })

        return Response({'history': history}, status=status.HTTP_200_OK)


class CustomAnalyticsPromptView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        prompt_text = str(request.data.get('prompt_text', '')).strip()
        quiz_id = request.data.get('quiz_id')

        if not quiz_id:
            return Response({'error': 'quiz_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not prompt_text:
            return Response({'error': 'prompt_text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quiz = Quiz.objects.get(pk=quiz_id)
        except Quiz.DoesNotExist:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

        student_context = build_student_context(quiz)
        generated_text = call_llm_response(prompt_text, student_context)

        prompt_record = CustomAnalyticsPrompt.objects.create(
            quiz=quiz,
            prompt_text=prompt_text,
            response_text=generated_text,
            is_announcement=False,
        )

        return Response({
            'id': prompt_record.id,
            'quiz_id': str(quiz.id),
            'prompt_text': prompt_record.prompt_text,
            'response_text': prompt_record.response_text,
            'is_announcement': prompt_record.is_announcement,
            'created_at': prompt_record.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class ShareCustomAnalyticsPromptView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        prompt_id = request.data.get('prompt_id')
        quiz_id = request.data.get('quiz_id')

        if not prompt_id or not quiz_id:
            return Response({'error': 'prompt_id and quiz_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            prompt_record = CustomAnalyticsPrompt.objects.get(id=prompt_id, quiz_id=quiz_id)
        except CustomAnalyticsPrompt.DoesNotExist:
            return Response({'error': 'Prompt record not found.'}, status=status.HTTP_404_NOT_FOUND)

        prompt_record.is_announcement = True
        prompt_record.save(update_fields=['is_announcement'])

        quiz = prompt_record.quiz
        quiz.shared_insight_text = prompt_record.response_text
        quiz.shared_insight_updated_at = timezone.now()
        quiz.save(update_fields=['shared_insight_text', 'shared_insight_updated_at'])

        return Response({
            'prompt_id': prompt_record.id,
            'quiz_id': str(quiz.id),
            'is_announcement': True,
            'shared_insight_text': quiz.shared_insight_text,
            'shared_insight_updated_at': quiz.shared_insight_updated_at.isoformat() if quiz.shared_insight_updated_at else None,
        }, status=status.HTTP_200_OK)


class QuestionImageUploadView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        image_file = request.FILES.get('image')
        if not image_file:
            return Response({'error': 'image file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        content_type = str(image_file.content_type or '').lower()
        if not content_type.startswith('image/'):
            return Response({'error': 'Only image uploads are supported.'}, status=status.HTTP_400_BAD_REQUEST)

        extension = os.path.splitext(image_file.name)[1] or '.png'
        storage_path = f"question_images/{uuid.uuid4().hex}{extension}"
        stored_path = default_storage.save(storage_path, image_file)
        image_url = default_storage.url(stored_path)

        return Response({
            'question_image_url': request.build_absolute_uri(image_url),
        }, status=status.HTTP_201_CREATED)


class QuestionPeerResponsesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, quiz_id, question_id):
        student_name = str(request.query_params.get('student_name', '')).strip()

        try:
            question = Quiz.objects.get(pk=quiz_id).questions.get(pk=question_id)
        except Quiz.DoesNotExist:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not question.allow_peer_upvoting:
            return Response({'responses': []}, status=status.HTTP_200_OK)

        responses = question.peer_responses.all()
        serializer = PeerResponseSerializer(responses, many=True, context={'student_name': student_name})
        return Response({'responses': serializer.data}, status=status.HTTP_200_OK)

    def post(self, request, quiz_id, question_id):
        student_name = str(request.data.get('student_name', '')).strip()
        response_text = str(request.data.get('response_text', '')).strip()

        if not student_name:
            return Response({'error': 'student_name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not response_text:
            return Response({'error': 'response_text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quiz = Quiz.objects.get(pk=quiz_id)
            question = quiz.questions.get(pk=question_id)
        except Quiz.DoesNotExist:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not question.allow_peer_upvoting:
            return Response({'error': 'Peer upvoting is not enabled for this question.'}, status=status.HTTP_400_BAD_REQUEST)

        peer_response, created = PeerResponse.objects.get_or_create(
            quiz=quiz,
            question=question,
            student_name=student_name,
            defaults={'response_text': response_text},
        )

        if not created and peer_response.response_text != response_text:
            peer_response.response_text = response_text
            peer_response.upvote_count = 0
            peer_response.upvoted_by = []
            peer_response.save(update_fields=['response_text', 'upvote_count', 'upvoted_by'])

        serializer = PeerResponseSerializer(peer_response, context={'student_name': student_name})
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PeerResponseUpvoteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, response_id):
        student_name = str(request.data.get('student_name', '')).strip()
        if not student_name:
            return Response({'error': 'student_name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                peer_response = PeerResponse.objects.select_for_update().get(pk=response_id)
                voters = list(peer_response.upvoted_by or [])

                if peer_response.student_name == student_name:
                    return Response({'error': 'You cannot upvote your own response.'}, status=status.HTTP_400_BAD_REQUEST)

                if student_name in voters:
                    serializer = PeerResponseSerializer(peer_response, context={'student_name': student_name})
                    return Response({'already_upvoted': True, 'response': serializer.data}, status=status.HTTP_200_OK)

                voters.append(student_name)
                peer_response.upvoted_by = voters
                peer_response.upvote_count = F('upvote_count') + 1
                peer_response.save(update_fields=['upvote_count', 'upvoted_by'])
                peer_response.refresh_from_db()
        except PeerResponse.DoesNotExist:
            return Response({'error': 'Response not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = PeerResponseSerializer(peer_response, context={'student_name': student_name})
        return Response({'already_upvoted': False, 'response': serializer.data}, status=status.HTTP_200_OK)


class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.prefetch_related('questions').all()
    serializer_class = QuizSerializer

    def get_serializer_class(self):
        return QuizSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if request.user and request.user.is_authenticated:
            quiz = serializer.save(created_by=request.user)
        else:
            quiz = serializer.save()

        # Rehydrate from DB to guarantee the response includes persisted nested questions and metadata.
        hydrated_quiz = Quiz.objects.prefetch_related('questions').get(pk=quiz.pk)
        response_serializer = self.get_serializer(hydrated_quiz)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

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
        return Response(self._build_analytics_payload(quiz))

    @action(detail=True, methods=['post'], url_path='analytics/refresh')
    def refresh_analytics(self, request, pk=None):
        quiz = self.get_object()
        return Response(self._build_analytics_payload(quiz))

    @action(detail=True, methods=['post'], url_path='share-analytics')
    def share_analytics(self, request, pk=None):
        quiz = self.get_object()
        raw_share = request.data.get('is_shared_with_students', False)
        if isinstance(raw_share, str):
            should_share = raw_share.strip().lower() in {'1', 'true', 'yes', 'on'}
        else:
            should_share = bool(raw_share)
        quiz.is_shared_with_students = should_share
        quiz.save(update_fields=['is_shared_with_students'])
        return Response({'quiz_id': str(quiz.id), 'is_shared_with_students': quiz.is_shared_with_students})

    def _build_analytics_payload(self, quiz):
        submissions = quiz.submissions.all()
        question_lookup = {question.id: question for question in quiz.questions.all()}

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
                question_type = normalize_question_type(answer.get('question_type'))
                if question_type == 'Essay Question' and isinstance(answer_value, str) and answer_value.strip():
                    essay_texts.append(answer_value.strip())
                elif question_type in {'Fill In the Blank'} and isinstance(answer_value, str) and answer_value.strip():
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
            most_popular_gists = [
                f"Most students framed their explanation around {word}." for word, _ in top_essay_words
            ]
            most_popular_gists.append(f"Collected {len(essay_texts)} essay responses in the current live stream.")
            most_popular_gists.append(
                f"The strongest repeated signal is {top_essay_words[0][0]} ({top_essay_words[0][1]} mentions)."
            )
            most_popular_gists = most_popular_gists[:5]
        else:
            common_misconceptions = ['No essay responses yet.']
            key_themes_detected = ['Waiting for student essay submissions.']
            class_confidence_index = 0.0
            most_popular_gists = [
                'Essay stream is still warming up.',
                'No dominant explanation pattern detected yet.',
                'Share analytics to let students see emerging themes.',
                'Use refresh after submissions arrive to update synthesis.',
            ]

        individual_submissions = []
        for submission in submissions:
            choice_badge = 'N/A'
            text_fragments = []

            for answer_item in submission.answers or []:
                if not isinstance(answer_item, dict):
                    continue

                question = question_lookup.get(answer_item.get('question_id'))
                answer_value = answer_item.get('answer')
                question_type = normalize_question_type(
                    answer_item.get('question_type') or (question.question_type if question else None)
                )

                if choice_badge == 'N/A' and question_type in {'Multiple Choice', 'True/False', 'Multiple Answers'}:
                    options = []
                    if question and isinstance(question.interaction_data, dict):
                        options = question.interaction_data.get('options') or []

                    if isinstance(answer_value, list):
                        labels = []
                        for item in answer_value:
                            option_index = options.index(item) if item in options else None
                            label = index_to_choice_label(option_index) if option_index is not None else None
                            if label:
                                labels.append(label)
                        if labels:
                            choice_badge = ','.join(labels)
                    elif isinstance(answer_value, str):
                        option_index = options.index(answer_value) if answer_value in options else None
                        if option_index is not None:
                            label = index_to_choice_label(option_index)
                            if label:
                                choice_badge = label
                        elif answer_value.isdigit():
                            label = index_to_choice_label(answer_value)
                            if label:
                                choice_badge = label
                    elif isinstance(answer_value, (int, float)):
                        label = index_to_choice_label(answer_value)
                        if label:
                            choice_badge = label

                if question_type in {'Essay Question', 'Fill In the Blank', 'Fill In Multiple Blanks', 'Multiple Dropdowns'}:
                    if isinstance(answer_value, str) and answer_value.strip():
                        text_fragments.append(answer_value.strip())
                    elif isinstance(answer_value, dict):
                        non_empty_values = [str(value).strip() for value in answer_value.values() if str(value).strip()]
                        if non_empty_values:
                            text_fragments.append(' | '.join(non_empty_values))

            individual_submissions.append({
                'submission_id': submission.id,
                'student_name': submission.student_name,
                'submitted_at': submission.submitted_at.isoformat(),
                'choice_badge': choice_badge,
                'response_text': '\n\n'.join(text_fragments) if text_fragments else 'No long-form textual response captured for this submission.',
            })

        prompt_history = [
            {
                'id': item.id,
                'prompt_text': item.prompt_text,
                'response_text': item.response_text,
                'is_announcement': item.is_announcement,
                'created_at': item.created_at.isoformat(),
            }
            for item in quiz.custom_prompts.all()[:25]
        ]

        top_voted_answers = [
            {
                'id': item.id,
                'student_name': item.student_name,
                'response_text': item.response_text,
                'upvote_count': item.upvote_count,
                'question_id': item.question_id,
                'question_title': item.question.question_title,
            }
            for item in quiz.peer_responses.select_related('question').all()[:10]
        ]

        peer_upvoting_enabled = quiz.questions.filter(allow_peer_upvoting=True).exists()

        analytics = {
            'quiz_id': str(quiz.id),
            'is_shared_with_students': quiz.is_shared_with_students,
            'shared_insight_text': quiz.shared_insight_text,
            'shared_insight_updated_at': quiz.shared_insight_updated_at.isoformat() if quiz.shared_insight_updated_at else None,
            'peer_upvoting_enabled': peer_upvoting_enabled,
            'total_submissions': total_submissions,
            'average_score': avg_score,
            'max_score': max_score,
            'min_score': min_score,
            'word_cloud': [{'word': word, 'count': count} for word, count in top_words],
            'essay_summary': {
                'common_misconceptions': common_misconceptions,
                'key_themes_detected': key_themes_detected,
                'class_confidence_index': class_confidence_index,
                'most_popular_gists': most_popular_gists,
            },
            'common_misconceptions': common_misconceptions,
            'key_themes_detected': key_themes_detected,
            'class_confidence_index': class_confidence_index,
            'most_popular_gists': most_popular_gists,
            'individual_submissions': individual_submissions,
            'custom_prompt_history': prompt_history,
            'top_voted_answers': top_voted_answers,
        }
        return analytics


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
        self.sync_peer_responses(submission)
        response_serializer = SubmissionSerializer(submission)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def sync_peer_responses(self, submission):
        question_map = {question.id: question for question in submission.quiz.questions.all()}

        for answer_item in submission.answers or []:
            if not isinstance(answer_item, dict):
                continue

            question = question_map.get(answer_item.get('question_id'))
            if not question or not question.allow_peer_upvoting:
                continue

            question_type = normalize_question_type(question.question_type)
            if question_type not in SHORT_TEXT_TYPES:
                continue

            response_text = extract_textual_answer(answer_item.get('answer'))
            if not response_text:
                continue

            peer_response, created = PeerResponse.objects.get_or_create(
                quiz=submission.quiz,
                question=question,
                student_name=submission.student_name,
                defaults={'response_text': response_text},
            )

            if not created and peer_response.response_text != response_text:
                peer_response.response_text = response_text
                peer_response.upvote_count = 0
                peer_response.upvoted_by = []
                peer_response.save(update_fields=['response_text', 'upvote_count', 'upvoted_by'])

    def grade_submission(self, submission):
        quiz = submission.quiz
        questions = {q.id: q for q in quiz.questions.all()}
        gradable_question_ids = [
            question_id
            for question_id, question in questions.items()
            if normalize_question_type(question.question_type) != 'Text (no question)'
        ]
        score = 0
        total_possible = len(gradable_question_ids)

        for answer_item in submission.answers or []:
            if not isinstance(answer_item, dict):
                continue

            question_id = answer_item.get('question_id')
            question = questions.get(question_id)
            if not question:
                continue

            answer_value = answer_item.get('answer')
            question_type = normalize_question_type(question.question_type)
            interaction = question.interaction_data or {}

            if question_type == 'Multiple Choice':
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
            elif question_type == 'True/False':
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
            elif question_type == 'Multiple Answers':
                selected_values = answer_value if isinstance(answer_value, list) else []
                correct_indices = interaction.get('correct_indices') or []
                options = interaction.get('options') or []
                expected_values = []
                for index in correct_indices:
                    try:
                        expected_values.append(str(options[int(index)]).strip())
                    except (TypeError, ValueError, IndexError):
                        continue
                if set(map(str, selected_values)) == set(expected_values):
                    score += 1
            elif question_type in ['Formula Question', 'Numerical Answer']:
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
            elif question_type in ['Fill In the Blank', 'Fill In Multiple Blanks', 'Multiple Dropdowns', 'Matching']:
                if answer_value is not None and str(answer_value).strip() != '':
                    score += 1
            elif question_type in ['Essay Question', 'File Upload Question']:
                if answer_value is not None and str(answer_value).strip() != '':
                    score += 1
            elif question_type == 'Text (no question)':
                continue
            elif question_type in ['essay_question', 'one_word_question', 'fill_in_the_blank_question']:
                if answer_value is not None and str(answer_value).strip() != '':
                    score += 1

        submission.score = score
        submission.total_possible = total_possible
        submission.save(update_fields=['score', 'total_possible'])
